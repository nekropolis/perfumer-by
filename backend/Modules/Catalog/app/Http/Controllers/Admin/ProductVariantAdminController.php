<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSet;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Http\Resources\ProductVariantResource;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\Catalog\Support\VariantDefinitionVolume;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockInventoryService;

class ProductVariantAdminController extends Controller
{
    public function showDefinition(int $id): JsonResponse
    {
        $definition = VariantDefinition::query()->findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $definition->id,
                'title' => $definition->title,
                'volume_ml' => $definition->volume_ml,
                'volume_label' => $definition->volume_label,
                'concentration_code' => $definition->concentration_code,
                'concentration_label' => $definition->concentration_label,
                'is_tester' => (bool) $definition->is_tester,
                'is_vial' => (bool) $definition->is_vial,
                'is_miniature' => (bool) $definition->is_miniature,
                'is_set' => (bool) $definition->is_set,
                'excludes_from_free_delivery_threshold' => (bool) $definition->excludes_from_free_delivery_threshold,
            ],
        ]);
    }

    public function storeDefinition(Request $request): JsonResponse
    {
        $isSet = (bool) $request->boolean('is_set');

        if ($isSet) {
            $validated = $request->validate([
                'is_set' => ['required', 'boolean'],
                'concentration_label' => ['nullable', 'string', 'max:120'],
                'volume_label' => ['nullable', 'string', 'max:120'],
                'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
                'sort_order' => ['nullable', 'integer', 'min:0'],
            ]);

            $definition = app(\Modules\Catalog\Support\VariantDefinitionResolver::class)->resolveOrCreateSet();

            $volumeLabel = $definition->volume_label;
            if (array_key_exists('volume_label', $validated)) {
                $trimmedVolumeLabel = trim((string) $validated['volume_label']);
                $volumeLabel = $trimmedVolumeLabel !== '' ? $trimmedVolumeLabel : null;
            }

            $concentrationLabel = $definition->concentration_label;
            if (array_key_exists('concentration_label', $validated)) {
                $trimmedConcentrationLabel = trim((string) $validated['concentration_label']);
                $concentrationLabel = $trimmedConcentrationLabel !== ''
                    ? $trimmedConcentrationLabel
                    : \Modules\Catalog\Support\VariantDefinitionResolver::SET_CONCENTRATION_LABEL;
            }

            $definition->update([
                'volume_label' => $volumeLabel,
                'concentration_label' => $concentrationLabel,
                'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? false),
                'sort_order' => (int) ($validated['sort_order'] ?? $definition->sort_order),
                'title' => \Modules\Catalog\Support\VariantDefinitionResolver::SET_CONCENTRATION_LABEL,
            ]);

            return response()->json([
                'message' => 'Вариант справочника добавлен',
                'data' => $definition->fresh(),
            ], 201);
        }

        $validated = $request->validate([
            'volume_ml' => VariantDefinitionVolume::validationRules(),
            'concentration_code' => ['required', 'string', 'max:50'],
            'concentration_label' => ['required', 'string', 'max:120'],
            'is_tester' => ['nullable', 'boolean'],
            'is_vial' => ['nullable', 'boolean'],
            'is_miniature' => ['nullable', 'boolean'],
            'is_set' => ['nullable', 'boolean'],
            'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ], VariantDefinitionVolume::validationMessages());

        $isTester = (bool) ($validated['is_tester'] ?? false);
        $isVial = (bool) ($validated['is_vial'] ?? false);
        $isMiniature = (bool) ($validated['is_miniature'] ?? false);
        $this->assertVariantFlagsCompatible($isTester, $isVial, $isMiniature);

        $volumeMl = VariantDefinitionVolume::normalize($validated['volume_ml']);
        $concentrationCode = mb_strtolower(trim((string) $validated['concentration_code']));

        VariantDefinitionVolume::assertUnique($volumeMl, $concentrationCode, $isTester, $isVial, $isMiniature);

        $definition = VariantDefinition::query()->create([
            'volume_ml' => $volumeMl,
            'concentration_code' => $concentrationCode,
            'concentration_label' => trim((string) $validated['concentration_label']),
            'is_tester' => $isTester,
            'is_vial' => $isVial,
            'is_miniature' => $isMiniature,
            'is_set' => false,
            'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? false),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'title' => VariantDefinitionVolume::buildTitle(
                $volumeMl,
                (string) $validated['concentration_code'],
                (string) $validated['concentration_label'],
                $isTester,
                $isVial,
                $isMiniature,
            ),
        ]);

        return response()->json([
            'message' => 'Вариант справочника добавлен',
            'data' => $definition,
        ], 201);
    }

    public function updateDefinition(Request $request, int $id): JsonResponse
    {
        $definition = VariantDefinition::query()->findOrFail($id);

        if ($definition->is_set) {
            $validated = $request->validate([
                'concentration_label' => ['nullable', 'string', 'max:120'],
                'volume_label' => ['nullable', 'string', 'max:120'],
                'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
                'sort_order' => ['nullable', 'integer', 'min:0'],
            ]);

            $volumeLabel = $definition->volume_label;
            if (array_key_exists('volume_label', $validated)) {
                $trimmedVolumeLabel = trim((string) $validated['volume_label']);
                $volumeLabel = $trimmedVolumeLabel !== '' ? $trimmedVolumeLabel : null;
            }

            $concentrationLabel = $definition->concentration_label;
            if (array_key_exists('concentration_label', $validated)) {
                $trimmedConcentrationLabel = trim((string) $validated['concentration_label']);
                $concentrationLabel = $trimmedConcentrationLabel !== ''
                    ? $trimmedConcentrationLabel
                    : \Modules\Catalog\Support\VariantDefinitionResolver::SET_CONCENTRATION_LABEL;
            }

            $definition->update([
                'volume_label' => $volumeLabel,
                'concentration_label' => $concentrationLabel,
                'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? $definition->excludes_from_free_delivery_threshold),
                'sort_order' => (int) ($validated['sort_order'] ?? $definition->sort_order),
                'title' => \Modules\Catalog\Support\VariantDefinitionResolver::SET_CONCENTRATION_LABEL,
            ]);

            return response()->json([
                'message' => 'Вариант справочника обновлен',
                'data' => $definition->fresh(),
            ]);
        }

        $validated = $request->validate([
            'volume_ml' => VariantDefinitionVolume::validationRules(),
            'concentration_code' => ['required', 'string', 'max:50'],
            'concentration_label' => ['required', 'string', 'max:120'],
            'is_tester' => ['nullable', 'boolean'],
            'is_vial' => ['nullable', 'boolean'],
            'is_miniature' => ['nullable', 'boolean'],
            'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ], VariantDefinitionVolume::validationMessages());

        $isTester = (bool) ($validated['is_tester'] ?? false);
        $isVial = (bool) ($validated['is_vial'] ?? false);
        $isMiniature = (bool) ($validated['is_miniature'] ?? false);
        $this->assertVariantFlagsCompatible($isTester, $isVial, $isMiniature);

        $volumeMl = VariantDefinitionVolume::normalize($validated['volume_ml']);
        $concentrationCode = mb_strtolower(trim((string) $validated['concentration_code']));

        VariantDefinitionVolume::assertUnique($volumeMl, $concentrationCode, $isTester, $isVial, $isMiniature, $definition->id);

        $definition->update([
            'volume_ml' => $volumeMl,
            'concentration_code' => $concentrationCode,
            'concentration_label' => trim((string) $validated['concentration_label']),
            'is_tester' => $isTester,
            'is_vial' => $isVial,
            'is_miniature' => $isMiniature,
            'is_set' => false,
            'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? $definition->excludes_from_free_delivery_threshold),
            'sort_order' => (int) ($validated['sort_order'] ?? $definition->sort_order),
            'title' => VariantDefinitionVolume::buildTitle(
                $volumeMl,
                (string) $validated['concentration_code'],
                (string) $validated['concentration_label'],
                $isTester,
                $isVial,
                $isMiniature,
            ),
        ]);

        return response()->json([
            'message' => 'Вариант справочника обновлен',
            'data' => $definition->fresh(),
        ]);
    }

    public function destroyDefinition(int $id): JsonResponse
    {
        $definition = VariantDefinition::query()->findOrFail($id);

        $hasLinks = ProductVariantLink::query()
            ->where('variant_definition_id', $definition->id)
            ->exists();

        if ($hasLinks) {
            return response()->json([
                'message' => 'Нельзя удалить вариант: он уже привязан к товарам',
            ], 422);
        }

        $definition->delete();

        return response()->json([
            'message' => 'Вариант справочника удален',
        ]);
    }

    public function catalog(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));

        $query = VariantDefinition::query()
            ->orderBy('volume_ml')
            ->orderBy('concentration_code')
            ->orderBy('is_tester')
            ->orderBy('is_vial')
            ->orderBy('is_miniature');

        if ($search !== '') {
            if (preg_match('/^\d+(?:[.,]\d+)?$/', $search)) {
                $query->where('volume_ml', VariantDefinitionVolume::normalize($search));
            } else {
                $normalizedSearch = mb_strtolower($search);

                $query->where(function ($subQuery) use ($normalizedSearch) {
                    $subQuery->whereRaw('LOWER(title) like ?', ["%{$normalizedSearch}%"])
                        ->orWhereRaw('LOWER(concentration_code) like ?', ["%{$normalizedSearch}%"])
                        ->orWhereRaw('LOWER(concentration_label) like ?', ["%{$normalizedSearch}%"]);
                });
            }
        }

        $transform = function (VariantDefinition $item): array {
            return [
                'id' => $item->id,
                'title' => $item->title,
                'volume_ml' => $item->volume_ml,
                'volume_label' => $item->volume_label,
                'concentration_code' => $item->concentration_code,
                'concentration_label' => $item->concentration_label,
                'is_tester' => (bool) $item->is_tester,
                'is_vial' => (bool) $item->is_vial,
                'is_miniature' => (bool) $item->is_miniature,
                'is_set' => (bool) $item->is_set,
                'excludes_from_free_delivery_threshold' => (bool) $item->excludes_from_free_delivery_threshold,
            ];
        };

        // Пагинация включается ТОЛЬКО если клиент явно её запросил (?page=… или ?per_page=…).
        // Это сохраняет совместимость с потребителями, которым нужен полный список
        // (селекторы вариантов в формах продукта и Seller One).
        if ($request->filled('page') || $request->filled('per_page')) {
            $perPage = max(1, min((int) $request->input('per_page', 50), 200));
            $paginator = $query->paginate($perPage);
            $paginator->getCollection()->transform($transform);

            return response()->json([
                'data' => $paginator->items(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ]);
        }

        $items = $query->limit(100)->get()->map($transform);

        return response()->json(['data' => $items]);
    }

    public function index(int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);
        $mainWarehouseId = (int) Warehouse::query()
            ->where('code', Warehouse::CODE_MAIN)
            ->value('id');
        $supplierWarehouseId = (int) Warehouse::query()
            ->where('code', Warehouse::CODE_SUPPLIER)
            ->value('id');

        $variants = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->with(['definition', 'productSet:id,product_variant_link_id'])
            ->withCount([
                'supplierOffers as supplier_offers_count',
                'supplierOffers as active_supplier_offers_count' => static function ($query) {
                    CatalogVariantStockPresenter::applySupplierOfferListingScope($query);
                },
            ])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $variantIds = $variants->pluck('id')->filter()->values()->all();
        $warehouseStocks = $variantIds !== [] && ($mainWarehouseId > 0 || $supplierWarehouseId > 0)
            ? WarehouseVariantStock::query()
                ->where('product_id', $product->id)
                ->whereIn('variant_id', $variantIds)
                ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
                ->get(['variant_id', 'warehouse_id', 'stock', 'reserved_stock'])
                ->groupBy('variant_id')
            : collect();

        $items = $variants->map(function (ProductVariantLink $variant) use ($warehouseStocks, $mainWarehouseId, $supplierWarehouseId): array {
            $byWh = $warehouseStocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $byWh->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $byWh->get($supplierWarehouseId) : null;
            $mainAvailableStock = $mainStock
                ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock)
                : 0;
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
            $catalogListPrice = CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);

            return array_merge($variant->toArray(), [
                'product_set_id' => $variant->productSet?->id,
                'main_available_stock' => $mainAvailableStock,
                'available_stock' => (int) $presented['available_stock'],
                'is_available' => (bool) $presented['is_available'],
                'fulfillment_tooltip' => ProductVariantResource::adminFulfillmentTooltip($variant, $mainStock, $supplierStock),
                'supplier_offers_count' => (int) ($variant->supplier_offers_count ?? 0),
                'active_supplier_offers_count' => (int) ($variant->active_supplier_offers_count ?? 0),
                'catalog_list_price' => $catalogListPrice,
            ]);
        })->values();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $validated = $request->validate([
            'variant_definition_id' => ['required', 'integer', 'exists:variant_definitions,id'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'old_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_preorder' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'is_promotion' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $variant = ProductVariantLink::query()->firstOrCreate(
            [
                'product_id' => $product->id,
                'variant_definition_id' => (int) $validated['variant_definition_id'],
            ],
            [
                'price' => $validated['price'] ?? null,
                'old_price' => $validated['old_price'] ?? null,
                'stock' => $validated['stock'] ?? 0,
                'is_preorder' => $validated['is_preorder'] ?? false,
                'is_active' => $validated['is_active'] ?? true,
                'is_promotion' => $validated['is_promotion'] ?? false,
                'sort_order' => $validated['sort_order'] ?? 0,
            ],
        );

        $created = $variant->wasRecentlyCreated;
        if (!$created) {
            $variant->update([
                'is_active' => $validated['is_active'] ?? $variant->is_active,
                'is_preorder' => $validated['is_preorder'] ?? $variant->is_preorder,
                'is_promotion' => $validated['is_promotion'] ?? $variant->is_promotion,
                'sort_order' => $validated['sort_order'] ?? $variant->sort_order,
            ]);
        }

        $this->syncProductStockFlags($product->fresh());

        return response()->json([
            'message' => $created ? 'Вариант добавлен' : 'Вариант уже был у товара',
            'data' => $variant->fresh()->load('definition'),
        ], $created ? 201 : 200);
    }

    public function update(Request $request, int $productId, int $variantId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variant = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->findOrFail($variantId);

        $validated = $request->validate([
            'variant_definition_id' => ['nullable', 'integer', 'exists:variant_definitions,id'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'old_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_preorder' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'is_promotion' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        if (array_key_exists('stock', $validated) && (int) $validated['stock'] < (int) $variant->reserved_stock) {
            throw ValidationException::withMessages([
                'stock' => 'Остаток не может быть меньше резерва',
            ]);
        }

        $updates = [];
        $priceBefore = $variant->price;
        $oldPriceBefore = $variant->old_price;

        if (array_key_exists('variant_definition_id', $validated)) {
            $updates['variant_definition_id'] = $validated['variant_definition_id'] ?? $variant->variant_definition_id;
        }
        if (array_key_exists('price', $validated)) {
            $updates['price'] = $validated['price'];
        }
        if (array_key_exists('old_price', $validated)) {
            $updates['old_price'] = $validated['old_price'];
        }
        if (array_key_exists('stock', $validated)) {
            $updates['stock'] = $validated['stock'] ?? 0;
        }
        if (array_key_exists('is_preorder', $validated)) {
            $updates['is_preorder'] = (bool) $validated['is_preorder'];
        }
        if (array_key_exists('is_active', $validated)) {
            $updates['is_active'] = (bool) $validated['is_active'];
        }
        if (array_key_exists('is_promotion', $validated)) {
            $updates['is_promotion'] = (bool) $validated['is_promotion'];
        }
        if (array_key_exists('sort_order', $validated)) {
            $updates['sort_order'] = $validated['sort_order'] ?? $variant->sort_order;
        }

        if ($updates !== []) {
            $variant->update($updates);
        }

        $freshVariant = $variant->fresh()->load('definition');

        $this->recordManualPriceChangeAudit(
            $product,
            $freshVariant,
            $priceBefore,
            $oldPriceBefore,
            array_key_exists('price', $validated),
            array_key_exists('old_price', $validated),
        );

        $this->syncProductStockFlags($product->fresh());

        return response()->json([
            'message' => 'Вариант обновлен',
            'data' => $freshVariant,
        ]);
    }

    public function destroy(int $productId, int $variantId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variant = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->findOrFail($variantId);

        ProductSet::query()
            ->where('product_id', $product->id)
            ->where('product_variant_link_id', $variant->id)
            ->delete();

        $variant->delete();

        $hasSets = ProductSet::query()->where('product_id', $product->id)->exists();
        if ((bool) $product->is_set !== $hasSets) {
            $product->update(['is_set' => $hasSets]);
        }

        $this->syncProductStockFlags($product->fresh());

        return response()->json([
            'message' => 'Вариант удален',
        ]);
    }

    private function syncProductStockFlags(Product $product): void
    {
        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);
    }

    private function recordManualPriceChangeAudit(
        Product $product,
        ProductVariantLink $variant,
        mixed $priceBefore,
        mixed $oldPriceBefore,
        bool $priceTouched,
        bool $oldPriceTouched,
    ): void {
        $priceChanged = $priceTouched && ! $this->nullableMoneyEquals($priceBefore, $variant->price);
        $oldPriceChanged = $oldPriceTouched && ! $this->nullableMoneyEquals($oldPriceBefore, $variant->old_price);

        if (! $priceChanged && ! $oldPriceChanged) {
            return;
        }

        $parts = [];
        if ($priceChanged) {
            $parts[] = sprintf(
                'цена %s → %s',
                $this->formatMoneyLabel($priceBefore),
                $this->formatMoneyLabel($variant->price),
            );
        }
        if ($oldPriceChanged) {
            $parts[] = sprintf(
                'старая цена %s → %s',
                $this->formatMoneyLabel($oldPriceBefore),
                $this->formatMoneyLabel($variant->old_price),
            );
        }

        $variantTitle = trim((string) ($variant->title ?? ''));
        if ($variantTitle === '') {
            $variantTitle = '#' . $variant->id;
        }

        app(AuditLogService::class)->record(
            AuditLogService::ENTITY_PRODUCT_VARIANT,
            (int) $variant->id,
            AuditLogService::ACTION_UPDATED,
            sprintf(
                'Ручное изменение цены варианта «%s» (товар #%d): %s',
                $variantTitle,
                (int) $product->id,
                implode(', ', $parts),
            ),
            [
                'product_id' => (int) $product->id,
                'product_name' => $product->name,
                'variant_id' => (int) $variant->id,
                'variant_title' => $variantTitle,
                'source' => 'admin_variant_update',
                'price_before' => $this->formatNullableMoney($priceBefore),
                'price_after' => $this->formatNullableMoney($variant->price),
                'old_price_before' => $this->formatNullableMoney($oldPriceBefore),
                'old_price_after' => $this->formatNullableMoney($variant->old_price),
                'price_changed' => $priceChanged,
                'old_price_changed' => $oldPriceChanged,
            ],
        );
    }

    private function nullableMoneyEquals(mixed $left, mixed $right): bool
    {
        $leftEmpty = $left === null || $left === '';
        $rightEmpty = $right === null || $right === '';

        if ($leftEmpty || $rightEmpty) {
            return $leftEmpty && $rightEmpty;
        }

        return MoneyDecimal::compare(
            MoneyDecimal::normalize($left),
            MoneyDecimal::normalize($right),
        ) === 0;
    }

    private function formatNullableMoney(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return MoneyDecimal::normalize($value);
    }

    private function formatMoneyLabel(mixed $value): string
    {
        return $this->formatNullableMoney($value) ?? 'пусто';
    }

    private function assertVariantFlagsCompatible(bool $isTester, bool $isVial, bool $isMiniature = false): void
    {
        if ($isTester && $isVial) {
            throw ValidationException::withMessages([
                'is_vial' => ['Вариант не может быть одновременно тестером и пробником'],
            ]);
        }

        if ($isVial && $isMiniature) {
            throw ValidationException::withMessages([
                'is_miniature' => ['Вариант не может быть одновременно пробником и миниатюрой'],
            ]);
        }
    }
}
