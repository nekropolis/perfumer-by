<?php

namespace Modules\Warehouse\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptImportMapping;

class StockReceiptXlsImportService
{
    private const TITLE_BRAND_ALIASES = [
        '/^a\.?\s*banderas\b/ui' => 'antonio banderas',
    ];

    public function __construct(
        private readonly StockReceiptService $receiptService,
        private readonly StockInventoryService $inventoryService,
        private readonly SellerOneVariantMatcher $variantMatcher,
    ) {
    }

    private ?Collection $brands = null;
    private ?Collection $matchRules = null;
    private ?array $variantsIndex = null;

    public function import(UploadedFile $file, array $payload): StockReceipt
    {
        $rows = $this->readRows($file);
        $aggregated = $this->aggregateRows($rows);
        $mappingIndex = $this->buildMappingIndex($payload['mapping'] ?? []);

        $items = [];
        $unresolved = [];

        foreach ($aggregated as $row) {
            $resolved = $this->resolveVariant($row['code'], $row['title']);
            if (!$resolved) {
                $resolved = $this->resolveVariantFromMapping($row, $mappingIndex);
            }
            if (!$resolved) {
                $resolved = $this->resolveVariantFromStoredMapping($row);
            }
            if (!$resolved) {
                $unresolved[] = $this->buildUnresolvedRow($row);
                continue;
            }

            $items[] = [
                'product_id' => $resolved['product_id'],
                'variant_id' => $resolved['variant_id'],
                'qty' => (int) $row['qty'],
                'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                'supplier_sku' => $row['code'] ?: null,
            ];
        }

        if (!empty($unresolved)) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Не удалось сопоставить часть строк XLS',
                    'unresolved' => $unresolved,
                    'unresolved_count' => count($unresolved),
                    'mapping_required' => true,
                ], 422)
            );
        }

        if (empty($items)) {
            abort(422, 'В XLS нет валидных строк для прихода');
        }

        $this->storeMappings($aggregated, $mappingIndex);

        return $this->receiptService->store([
            'warehouse_id' => (int) ($payload['warehouse_id'] ?? $this->inventoryService->getDefaultSupplierWarehouseId()),
            'supplier_id' => $payload['supplier_id'] ?? null,
            'supplier_code' => $payload['supplier_code'] ?? null,
            'supplier_name' => trim((string) ($payload['supplier_name'] ?? 'XLS import')),
            'received_at' => $payload['received_at'] ?? now()->toDateTimeString(),
            'comment' => $payload['comment'] ?? 'Импорт прихода из XLS',
            'items' => $items,
        ]);
    }

    private function readRows(UploadedFile $file): array
    {
        $ioFactoryClass = '\\PhpOffice\\PhpSpreadsheet\\IOFactory';
        if (!class_exists($ioFactoryClass)) {
            throw new \RuntimeException('Не установлен phpoffice/phpspreadsheet. Выполни composer install в backend.');
        }

        $spreadsheet = $ioFactoryClass::load($file->getRealPath());
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray();
        $result = [];

        foreach ($rows as $index => $row) {
            $code = trim((string) ($row[0] ?? ''));
            $title = trim((string) ($row[1] ?? ''));
            $price = $this->toFloat($row[2] ?? null);
            $qty = (int) round((float) ($this->toFloat($row[3] ?? null) ?? 0));

            if ($index === 0 && Str::lower($code) === 'код') {
                continue;
            }

            if ($title === '' || $qty <= 0) {
                continue;
            }

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $price,
                'qty' => $qty,
            ];
        }

        return $result;
    }

    private function aggregateRows(array $rows): array
    {
        $grouped = [];

        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $normalizedTitle = $this->normalizeExactTitle($title);
            $key = $code !== ''
                ? "sku:{$code}"
                : 'title:' . $normalizedTitle;

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'code' => $code,
                    'title' => $title,
                    'supplier_price' => $row['supplier_price'],
                    'qty' => 0,
                    'map_key' => $key,
                ];
            }

            $grouped[$key]['qty'] += (int) ($row['qty'] ?? 0);
            if (($row['supplier_price'] ?? null) !== null) {
                $grouped[$key]['supplier_price'] = $row['supplier_price'];
            }
        }

        return array_values($grouped);
    }

    private function resolveVariant(string $code, string $title): ?array
    {
        // 1) Основной путь: сопоставление по названию (после дедупа в XLS).
        $titleCandidates = $this->buildTitleCandidates($title);
        if (empty($titleCandidates)) {
            return null;
        }

        $offerByName = SupplierVariantOffer::query()
            ->with('productVariant')
            ->where(function ($query) use ($titleCandidates) {
                foreach ($titleCandidates as $normalizedTitle) {
                    $query
                        ->orWhereRaw('LOWER(TRIM(COALESCE(external_product_name, ""))) = ?', [$normalizedTitle])
                        ->orWhereRaw('LOWER(TRIM(COALESCE(external_variant_name, ""))) = ?', [$normalizedTitle])
                        ->orWhereRaw('LOWER(TRIM(CONCAT(COALESCE(external_product_name, ""), " ", COALESCE(external_variant_name, "")))) = ?', [$normalizedTitle]);
                }
            })
            ->orderByDesc('is_active')
            ->orderByDesc('id')
            ->first();
        if ($offerByName?->productVariant) {
            return [
                'product_id' => (int) $offerByName->productVariant->product_id,
                'variant_id' => (int) $offerByName->productVariant->id,
            ];
        }

        $variantId = null;
        foreach ($titleCandidates as $normalizedTitle) {
            $variantId = DB::table('product_variant_links as pvl')
                ->join('products as p', 'p.id', '=', 'pvl.product_id')
                ->join('variant_definitions as vd', 'vd.id', '=', 'pvl.variant_definition_id')
                ->whereRaw('LOWER(TRIM(CONCAT(p.name, " ", vd.title))) = ?', [$normalizedTitle])
                ->value('pvl.id');
            if ($variantId) {
                break;
            }
        }

        if ($variantId) {
            $variant = ProductVariantLink::query()->find((int) $variantId);
            if ($variant) {
                return [
                    'product_id' => (int) $variant->product_id,
                    'variant_id' => (int) $variant->id,
                ];
            }
        }

        // 2) Фолбек: если код есть и в офферах он все-таки заведен — пробуем матч по коду.
        if ($code !== '') {
            $codeCandidates = $this->buildCodeCandidates($code);
            $offerByCode = SupplierVariantOffer::query()
                ->with('productVariant')
                ->where(function ($query) use ($codeCandidates) {
                    $query
                        ->whereIn('external_id', $codeCandidates)
                        ->orWhereIn('sku', $codeCandidates);
                })
                ->orderByDesc('is_active')
                ->orderByDesc('id')
                ->first();

            if ($offerByCode?->productVariant) {
                return [
                    'product_id' => (int) $offerByCode->productVariant->product_id,
                    'variant_id' => (int) $offerByCode->productVariant->id,
                ];
            }
        }

        // 3) Fuzzy fallback по правилам парсера из SupplierPriceImportService.
        $matchedByParser = $this->resolveVariantByMatcher($code, $title);
        if ($matchedByParser) {
            return $matchedByParser;
        }

        return null;
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);
        if ($string === '') {
            return null;
        }

        $string = str_replace([' ', ','], ['', '.'], $string);
        if (!is_numeric($string)) {
            return null;
        }

        return (float) $string;
    }

    private function normalizeExactTitle(string $value): string
    {
        $normalized = mb_strtolower(trim($value));
        $normalized = str_replace('ё', 'е', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?: '';
        return trim($normalized);
    }

    private function buildTitleCandidates(string $title): array
    {
        $base = $this->normalizeExactTitle($title);
        if ($base === '') {
            return [];
        }

        $candidates = [$base];
        foreach (self::TITLE_BRAND_ALIASES as $pattern => $replacement) {
            $aliased = preg_replace($pattern, $replacement, $base);
            if (is_string($aliased) && $aliased !== '') {
                $candidates[] = $this->normalizeExactTitle($aliased);
            }
        }

        return array_values(array_unique($candidates));
    }

    private function buildCodeCandidates(string $code): array
    {
        $raw = trim($code);
        if ($raw === '') {
            return [];
        }

        $candidates = [$raw];
        $noSpaces = preg_replace('/\s+/u', '', $raw) ?? $raw;
        $candidates[] = $noSpaces;

        if (preg_match('/^\d+(\.0+)?$/', $noSpaces) === 1) {
            $intCode = (string) (int) ((float) $noSpaces);
            $candidates[] = $intCode;
            $candidates[] = ltrim($intCode, '0');
        }

        $normalized = array_values(array_unique(array_filter($candidates, static function ($value) {
            return is_string($value) && $value !== '';
        })));

        return $normalized;
    }

    private function resolveVariantByMatcher(string $code, string $title): ?array
    {
        foreach ($this->buildMatcherTitleCandidates($title) as $titleCandidate) {
            $parsed = $this->variantMatcher->parseSupplierRow(
                [
                    'code' => $code,
                    'title' => $titleCandidate,
                    'supplier_price' => null,
                ],
                $this->getBrands(),
                $this->getMatchRules(),
                $this->getVariantsIndex()
            );

            $variantId = (int) ($parsed['selected_variant_id'] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            return [
                'product_id' => (int) $variant->product_id,
                'variant_id' => (int) $variant->id,
            ];
        }

        return null;
    }

    private function buildMatcherTitleCandidates(string $title): array
    {
        $raw = trim($title);
        if ($raw === '') {
            return [];
        }

        $candidates = [$raw];
        foreach (self::TITLE_BRAND_ALIASES as $pattern => $replacement) {
            $aliased = preg_replace($pattern, $replacement, $raw);
            if (is_string($aliased) && trim($aliased) !== '') {
                $candidates[] = trim($aliased);
            }
        }

        return array_values(array_unique($candidates));
    }

    private function getBrands(): Collection
    {
        if ($this->brands === null) {
            $this->brands = Brand::query()
                ->select(['id', 'name'])
                ->get();
        }

        return $this->brands;
    }

    private function getMatchRules(): Collection
    {
        if ($this->matchRules === null) {
            $this->matchRules = SellerOneMatchRule::query()
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();
        }

        return $this->matchRules;
    }

    private function getVariantsIndex(): array
    {
        if ($this->variantsIndex === null) {
            $variants = ProductVariantLink::query()
                ->with(['product.brand', 'definition'])
                ->get();

            $grouped = [];
            foreach ($variants as $variant) {
                $brandId = $variant->product?->brand_id;
                if (!$brandId) {
                    continue;
                }
                $grouped[$brandId][] = $variant;
            }

            $this->variantsIndex = $grouped;
        }

        return $this->variantsIndex;
    }

    private function buildMappingIndex(mixed $mapping): array
    {
        if (!is_array($mapping)) {
            return [];
        }

        $index = [];
        foreach ($mapping as $row) {
            if (!is_array($row)) {
                continue;
            }

            $variantId = (int) ($row['variant_id'] ?? $row['selected_variant_id'] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $mapKey = trim((string) ($row['map_key'] ?? ''));
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));

            if ($mapKey !== '') {
                $index[$mapKey] = $variantId;
            }
            if ($code !== '') {
                $index['sku:' . $code] = $variantId;
            } else {
                $index['title:' . $this->normalizeExactTitle($title)] = $variantId;
            }
        }

        return $index;
    }

    private function resolveVariantFromMapping(array $row, array $mappingIndex): ?array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));
        if ($mapKey === '') {
            return null;
        }

        $variantId = (int) ($mappingIndex[$mapKey] ?? 0);
        if ($variantId <= 0) {
            return null;
        }

        $variant = ProductVariantLink::query()->find($variantId);
        if (!$variant) {
            return null;
        }

        return [
            'product_id' => (int) $variant->product_id,
            'variant_id' => (int) $variant->id,
        ];
    }

    private function buildUnresolvedRow(array $row): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));

        $parsed = $this->variantMatcher->parseSupplierRow(
            [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $row['supplier_price'] ?? null,
            ],
            $this->getBrands(),
            $this->getMatchRules(),
            $this->getVariantsIndex()
        );

        return [
            'map_key' => $mapKey,
            'code' => $code,
            'title' => $title,
            'supplier_price' => $row['supplier_price'] ?? null,
            'qty' => (int) ($row['qty'] ?? 0),
            'parsed' => $parsed['parsed'] ?? null,
            'suggested_variant' => $parsed['suggested_variant'] ?? null,
        ];
    }

    private function resolveVariantFromStoredMapping(array $row): ?array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $normalizedTitle = $this->normalizeExactTitle($title);

        $mapping = StockReceiptImportMapping::query()
            ->where(function ($query) use ($code, $normalizedTitle) {
                if ($code !== '') {
                    $query->where('supplier_sku', $code);
                }
                if ($normalizedTitle !== '') {
                    $query->orWhereRaw('LOWER(TRIM(COALESCE(source_title, ""))) = ?', [$normalizedTitle]);
                }
            })
            ->orderByDesc('updated_at')
            ->first();

        if (!$mapping) {
            return null;
        }

        $variant = ProductVariantLink::query()->find((int) $mapping->variant_id);
        if (!$variant) {
            return null;
        }

        return [
            'product_id' => (int) $variant->product_id,
            'variant_id' => (int) $variant->id,
        ];
    }

    private function storeMappings(array $aggregatedRows, array $mappingIndex): void
    {
        if (empty($mappingIndex)) {
            return;
        }

        foreach ($aggregatedRows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));
            if ($mapKey === '') {
                continue;
            }

            $variantId = (int) ($mappingIndex[$mapKey] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            StockReceiptImportMapping::query()->updateOrCreate(
                [
                    'supplier_sku' => $code !== '' ? $code : null,
                    'source_title' => $title !== '' ? $title : null,
                ],
                [
                    'product_id' => (int) $variant->product_id,
                    'variant_id' => (int) $variant->id,
                    'updated_by' => Auth::id(),
                    'created_by' => Auth::id(),
                ]
            );
        }
    }
}
