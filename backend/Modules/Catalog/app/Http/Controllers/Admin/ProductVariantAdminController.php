<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
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
                'concentration_code' => $definition->concentration_code,
                'concentration_label' => $definition->concentration_label,
                'is_tester' => (bool) $definition->is_tester,
                'excludes_from_free_delivery_threshold' => (bool) $definition->excludes_from_free_delivery_threshold,
            ],
        ]);
    }

    public function storeDefinition(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'volume_ml' => ['required', 'integer', 'min:1'],
            'concentration_code' => ['required', 'string', 'max:50'],
            'concentration_label' => ['required', 'string', 'max:120'],
            'is_tester' => ['nullable', 'boolean'],
            'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $definition = VariantDefinition::query()->create([
            'volume_ml' => (int) $validated['volume_ml'],
            'concentration_code' => mb_strtolower(trim((string) $validated['concentration_code'])),
            'concentration_label' => trim((string) $validated['concentration_label']),
            'is_tester' => (bool) ($validated['is_tester'] ?? false),
            'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? false),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'title' => $this->buildDefinitionTitle(
                (int) $validated['volume_ml'],
                (string) $validated['concentration_code'],
                (string) $validated['concentration_label'],
                (bool) ($validated['is_tester'] ?? false),
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

        $validated = $request->validate([
            'volume_ml' => ['required', 'integer', 'min:1'],
            'concentration_code' => ['required', 'string', 'max:50'],
            'concentration_label' => ['required', 'string', 'max:120'],
            'is_tester' => ['nullable', 'boolean'],
            'excludes_from_free_delivery_threshold' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $definition->update([
            'volume_ml' => (int) $validated['volume_ml'],
            'concentration_code' => mb_strtolower(trim((string) $validated['concentration_code'])),
            'concentration_label' => trim((string) $validated['concentration_label']),
            'is_tester' => (bool) ($validated['is_tester'] ?? false),
            'excludes_from_free_delivery_threshold' => (bool) ($validated['excludes_from_free_delivery_threshold'] ?? $definition->excludes_from_free_delivery_threshold),
            'sort_order' => (int) ($validated['sort_order'] ?? $definition->sort_order),
            'title' => $this->buildDefinitionTitle(
                (int) $validated['volume_ml'],
                (string) $validated['concentration_code'],
                (string) $validated['concentration_label'],
                (bool) ($validated['is_tester'] ?? false),
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
            ->orderBy('is_tester');

        if ($search !== '') {
            $query->where(function ($subQuery) use ($search) {
                $normalizedSearch = mb_strtolower($search);

                $subQuery->whereRaw('LOWER(title) like ?', ["%{$normalizedSearch}%"])
                    ->orWhereRaw('LOWER(concentration_code) like ?', ["%{$normalizedSearch}%"])
                    ->orWhereRaw('LOWER(concentration_label) like ?', ["%{$normalizedSearch}%"]);

                if (preg_match('/\d+/', $search, $m)) {
                    $subQuery->orWhere('volume_ml', (int) $m[0]);
                }
            });
        }

        $transform = function (VariantDefinition $item): array {
            return [
                'id' => $item->id,
                'title' => $item->title,
                'volume_ml' => $item->volume_ml,
                'concentration_code' => $item->concentration_code,
                'concentration_label' => $item->concentration_label,
                'is_tester' => (bool) $item->is_tester,
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
            ->with('definition')
            ->withCount([
                'supplierOffers as supplier_offers_count',
                'supplierOffers as active_supplier_offers_count' => static function ($query) {
                    $query->where('is_active', true)
                        ->where(function ($q) {
                            $q->whereNull('payload->missing_in_latest_price')
                                ->orWhere('payload->missing_in_latest_price', false);
                        })
                        ->where(function ($q) {
                            $q->whereNull('payload->out_of_stock_in_price_file')
                                ->orWhere('payload->out_of_stock_in_price_file', false);
                        });
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
                'main_available_stock' => $mainAvailableStock,
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
                'sort_order' => $validated['sort_order'] ?? 0,
            ],
        );

        $created = $variant->wasRecentlyCreated;
        if (!$created) {
            $variant->update([
                'is_active' => $validated['is_active'] ?? $variant->is_active,
                'is_preorder' => $validated['is_preorder'] ?? $variant->is_preorder,
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
            'sort_order' => ['nullable', 'integer'],
        ]);

        if (array_key_exists('stock', $validated) && (int) $validated['stock'] < (int) $variant->reserved_stock) {
            throw ValidationException::withMessages([
                'stock' => 'Остаток не может быть меньше резерва',
            ]);
        }

        $variant->update([
            'variant_definition_id' => $validated['variant_definition_id'] ?? $variant->variant_definition_id,
            'price' => $validated['price'] ?? null,
            'old_price' => $validated['old_price'] ?? null,
            'stock' => $validated['stock'] ?? 0,
            'is_preorder' => $validated['is_preorder'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? $variant->sort_order,
        ]);

        $this->syncProductStockFlags($product->fresh());

        return response()->json([
            'message' => 'Вариант обновлен',
            'data' => $variant->fresh()->load('definition'),
        ]);
    }

    public function destroy(int $productId, int $variantId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variant = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->findOrFail($variantId);

        $variant->delete();

        $this->syncProductStockFlags($product->fresh());

        return response()->json([
            'message' => 'Вариант удален',
        ]);
    }

    private function syncProductStockFlags(Product $product): void
    {
        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);
    }

    private function buildDefinitionTitle(
        int $volumeMl,
        string $concentrationCode,
        string $concentrationLabel,
        bool $isTester,
    ): string {
        $title = sprintf(
            '%d мл / %s - %s',
            $volumeMl,
            mb_strtoupper(trim($concentrationCode)),
            trim($concentrationLabel)
        );

        if ($isTester) {
            $title .= ' / Тестер';
        }

        return $title;
    }
}
