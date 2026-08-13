<?php

namespace Modules\Warehouse\Services;

use Illuminate\Http\UploadedFile;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Models\StockReceipt;

/**
 * Быстрый приход из XLSX по точным связям партномеров выбранного поставщика (seller-pars).
 * Колонки: 0 партномер, 1 название, 2 цена, 3 кол-во (пусто → 1). Первая строка — заголовок.
 */
class StockReceiptSupplierXlsxImportService
{
    public function __construct(
        private readonly StockReceiptService $receiptService,
        private readonly StockInventoryService $inventoryService,
    ) {
    }

    /**
     * @param  array{
     *     warehouse_id?: int|null,
     *     supplier_id: int,
     *     supplier_code?: string|null,
     *     supplier_name?: string|null,
     *     received_at?: string|null,
     *     comment?: string|null
     * }  $payload
     */
    public function importDraft(UploadedFile $file, array $payload): StockReceipt
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(180);
        }

        $supplierId = (int) ($payload['supplier_id'] ?? 0);
        if ($supplierId <= 0) {
            abort(422, 'Сначала выберите поставщика');
        }

        $supplier = Supplier::query()->findOrFail($supplierId);
        $ext = strtolower($file->getClientOriginalExtension() ?: '');
        if ($ext !== 'xlsx') {
            abort(422, 'Файл должен быть в формате XLSX');
        }

        $rows = $this->readRows($file);
        if ($rows === []) {
            abort(422, 'В XLSX нет строк для прихода');
        }

        $codes = array_values(array_unique(array_filter(array_map(
            static fn (array $row): string => trim((string) ($row['code'] ?? '')),
            $rows
        ), static fn (string $code): bool => $code !== '')));

        $offersByCode = $this->loadOffersByCode($supplierId, $codes);

        $items = [];
        $unmatched = [];

        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $qty = (int) ($row['qty'] ?? 1);
            $price = (float) ($row['supplier_price'] ?? 0);

            if ($code === '') {
                $unmatched[] = $this->formatUnmatchedLine($code, $title, $qty);

                continue;
            }

            $offer = $offersByCode[$code] ?? null;
            $variantId = $offer ? (int) $offer->product_variant_id : 0;
            if (!$offer || $variantId <= 0) {
                $unmatched[] = $this->formatUnmatchedLine($code, $title, $qty);

                continue;
            }

            $items[] = [
                'product_id' => (int) $offer->productVariant->product_id,
                'variant_id' => $variantId,
                'qty' => $qty,
                'supplier_price' => $price,
                'supplier_sku' => $code,
                'payload' => array_filter([
                    'supplier_product_name' => $title !== '' ? $title : null,
                    'title' => $title !== '' ? $title : null,
                ], static fn ($value) => $value !== null && $value !== ''),
            ];
        }

        if ($items === []) {
            abort(422, 'Ни одна строка XLSX не сопоставлена со связями поставщика');
        }

        $baseComment = trim((string) ($payload['comment'] ?? ''));
        $comment = $this->buildComment($baseComment, $unmatched);

        return $this->receiptService->store([
            'warehouse_id' => (int) ($payload['warehouse_id'] ?? $this->inventoryService->getMainWarehouseId() ?: $this->inventoryService->getDefaultSupplierWarehouseId()),
            'supplier_id' => $supplierId,
            'supplier_code' => $payload['supplier_code'] ?? $supplier->code,
            'supplier_name' => trim((string) ($payload['supplier_name'] ?? $supplier->name)),
            'received_at' => $payload['received_at'] ?? now()->toDateTimeString(),
            'comment' => $comment,
            'items' => $items,
        ]);
    }

    /**
     * @return list<array{code: string, title: string, supplier_price: float, qty: int}>
     */
    private function readRows(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new \RuntimeException('Не удалось прочитать загруженный файл');
        }

        $ioFactoryClass = '\\PhpOffice\\PhpSpreadsheet\\IOFactory';
        if (!class_exists($ioFactoryClass)) {
            throw new \RuntimeException('Не установлен phpoffice/phpspreadsheet. Выполни composer install в backend.');
        }

        $spreadsheet = $ioFactoryClass::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rawRows = $sheet->toArray();
        $result = [];

        foreach ($rawRows as $index => $row) {
            if ($index === 0) {
                continue;
            }

            $code = trim((string) ($row[0] ?? ''));
            $title = trim((string) ($row[1] ?? ''));
            $price = $this->toFloat($row[2] ?? null);
            $qtyRaw = $row[3] ?? null;
            $qtyEmpty = $qtyRaw === null || (is_string($qtyRaw) && trim($qtyRaw) === '');
            $qty = $qtyEmpty ? 1 : (int) round((float) ($this->toFloat($qtyRaw) ?? 0));

            if ($code === '' && $title === '') {
                continue;
            }

            if ($qty <= 0) {
                continue;
            }

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $price ?? 0.0,
                'qty' => $qty,
            ];
        }

        return $result;
    }

    /**
     * @param  list<string>  $codes
     * @return array<string, SupplierVariantOffer>
     */
    private function loadOffersByCode(int $supplierId, array $codes): array
    {
        if ($codes === []) {
            return [];
        }

        $offers = SupplierVariantOffer::query()
            ->with(['productVariant:id,product_id'])
            ->where('supplier_id', $supplierId)
            ->where(function ($query) use ($codes) {
                $query->whereIn('external_id', $codes)
                    ->orWhereIn('sku', $codes);
            })
            ->whereNotNull('product_variant_id')
            ->where('product_variant_id', '>', 0)
            ->orderByDesc('id')
            ->get();

        $index = [];
        foreach ($offers as $offer) {
            foreach ([(string) $offer->external_id, (string) $offer->sku] as $key) {
                $key = trim($key);
                if ($key === '' || isset($index[$key])) {
                    continue;
                }
                if (!$offer->productVariant) {
                    continue;
                }
                $index[$key] = $offer;
            }
        }

        return $index;
    }

    /**
     * @param  list<string>  $unmatched
     */
    private function buildComment(string $baseComment, array $unmatched): ?string
    {
        $parts = [];
        if ($baseComment !== '') {
            $parts[] = $baseComment;
        }
        if ($unmatched !== []) {
            $parts[] = "Без связи (".count($unmatched)."):\n".implode("\n", $unmatched);
        }

        if ($parts === []) {
            return null;
        }

        return implode("\n\n", $parts);
    }

    private function formatUnmatchedLine(string $code, string $title, int $qty): string
    {
        $codePart = $code !== '' ? $code : '—';
        $titlePart = $title !== '' ? $title : '—';

        return "{$codePart} — {$titlePart} — {$qty}";
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }

        $normalized = str_replace([' ', ','], ['', '.'], trim((string) $value));
        if ($normalized === '' || !is_numeric($normalized)) {
            return null;
        }

        return (float) $normalized;
    }
}
