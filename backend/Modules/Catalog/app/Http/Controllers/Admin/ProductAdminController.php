<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Http\Resources\ProductVariantResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Services\CatalogProductLinkSearchService;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\VariantDefinitionVolume;
use Modules\Catalog\Services\ProductDescriptionRewriter;
use Modules\ImportExport\Models\ImportRetryItem;
use Modules\ImportExport\Services\ImportRetryQueue;
use Modules\ImportExport\Support\LegacyProductDetector;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Services\StockInventoryService;

class ProductAdminController extends Controller
{
    private const int SMART_SEARCH_RESULT_LIMIT = 40;

    public function index(Request $request, CatalogProductLinkSearchService $linkSearch): JsonResponse
    {
        $query = Product::query()
            ->with(['brand'])
            ->withCount('variants')
            ->withCount([
                'variants as discounted_variants_count' => function ($variantQuery) {
                    $variantQuery->where('is_promotion', true);
                },
                'variants as variants_with_stock_count' => function ($variantQuery) {
                    self::scopeAdminVariantHasSellableChannel($variantQuery);
                },
            ]);

        if ($request->filled('search')) {
            $search = trim((string) preg_replace('/\s+/u', ' ', $request->string('search')->toString()));
            $stem = trim((string) preg_replace('/\s+-\s*.*$/u', '', $search)) ?: $search;
            $searchAmp = trim((string) preg_replace('/\s*&\s*/u', ' & ', $search));
            $stemAmp = trim((string) preg_replace('/\s*&\s*/u', ' & ', $stem));

            $linkSearch->applyAdminProductListSearch($query, $search);

            // display_name суб-кей: CONCAT(brand.name, ' ', products.name).
            // brands.name берётся через correlated subquery, т.к. JOIN отсутствует (with('brand') — eager load).
            $brandNameSub = '(SELECT `name` FROM `brands` WHERE `brands`.`id` = `products`.`brand_id` LIMIT 1)';

            $bindings = [
                $search,          // 0 — display exact match
                $searchAmp,       // 1 — display exact with normalized &
                $stem,            // 2 — display stem exact
                $stemAmp,         // 3 — display stem exact with normalized &
                $search,          // 4 — name exact
                $stem,            // 5 — name stem exact
                $search,          // 6 — slug exact
                $stem,            // 7 — slug stem exact
                $search . '%',    // 8 — display starts with
                $searchAmp . '%', // 9 — display starts with normalized &
                $stem . '%',      // 10 — display stem starts with
                $stemAmp . '%',   // 11 — display stem starts with normalized &
                $search . '%',    // 12 — name starts with
                $stem . '%',      // 13 — name stem starts with
                '%' . $search . '%', // 14 — name LIKE partial
                '%' . $stem . '%', // 15 — name stem LIKE partial
                '%' . $search . '%', // 16 — slug LIKE partial
                '%' . $stem . '%', // 17 — slug stem LIKE partial
            ];

            // display name expression для точного и префиксного совпадения (brand.name + ' ' + product.name).
            $displayNameExpr = "LOWER(TRIM(CONCAT(COALESCE({$brandNameSub}, ''), ' ', COALESCE(`products`.`name`, ''))))";

            $relevanceCase = '(CASE
                WHEN ' . $displayNameExpr . " = LOWER(?) OR " . $displayNameExpr . " = LOWER(?) THEN 0
                WHEN " . $displayNameExpr . " = LOWER(?) OR " . $displayNameExpr . " = LOWER(?) THEN 1
                WHEN LOWER(TRIM(`products`.`name`)) = LOWER(?) OR LOWER(TRIM(`products`.`name`)) = LOWER(?) THEN 2
                WHEN LOWER(TRIM(`products`.`slug`)) = LOWER(?) OR LOWER(TRIM(`products`.`slug`)) = LOWER(?) THEN 3
                WHEN " . $displayNameExpr . ' LIKE LOWER(?) OR ' . $displayNameExpr . ' LIKE LOWER(?) THEN 4
                WHEN ' . $displayNameExpr . ' LIKE LOWER(?) OR ' . $displayNameExpr . ' LIKE LOWER(?) THEN 5
                WHEN LOWER(`products`.`name`) LIKE LOWER(?) THEN 6
                WHEN LOWER(`products`.`name`) LIKE LOWER(?) THEN 7
                WHEN LOWER(`products`.`name`) LIKE LOWER(?) THEN 8
                WHEN LOWER(`products`.`name`) LIKE LOWER(?) THEN 9
                WHEN LOWER(`products`.`slug`) LIKE LOWER(?) THEN 10
                WHEN LOWER(`products`.`slug`) LIKE LOWER(?) THEN 11
                ELSE 12 END)';

            $query->orderByRaw($relevanceCase, $bindings);
            $query->orderByDesc('products.id');
        } else {
            $query->orderByDesc('id');
        }

        if ($request->filled('brand_id')) {
            $query->where('brand_id', (int) $request->input('brand_id'));
        }

        if ($request->filled('out_of_stock')) {
            $outOfStock = (string) $request->input('out_of_stock');
            if ($outOfStock === '1') {
                $query->whereDoesntHave('variants', function ($variantQuery) {
                    self::scopeAdminVariantHasSellableChannel($variantQuery);
                });
            } elseif ($outOfStock === '0') {
                $query->whereHas('variants', function ($variantQuery) {
                    self::scopeAdminVariantHasSellableChannel($variantQuery);
                });
            }
        }

        if ($request->filled('status')) {
            $status = (string) $request->input('status');

            if ($status === 'new') {
                $query->where('is_new', true);
            } elseif ($status === 'hit') {
                $query->where('is_hit', true);
            } elseif ($status === 'discount') {
                $query->whereHas('variants', function ($variantQuery) {
                    $variantQuery->where('is_promotion', true);
                });
            }
        }

        $products = $query->paginate(20);

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $isNumericIdSearch = preg_match('/^\d{1,12}$/', $search) === 1 && (int) $search > 0;
            $productIds = $products->getCollection()->pluck('id')->map(static fn ($id): int => (int) $id)->all();

            $matchedVariantIdsByProductId = collect();
            if ($isNumericIdSearch && $productIds !== []) {
                $variantRows = ProductVariantLink::query()
                    ->whereIn('product_id', $productIds)
                    ->where((new ProductVariantLink())->getQualifiedKeyName(), (int) $search)
                    ->get(['id', 'product_id']);

                $matchedVariantIdsByProductId = $variantRows
                    ->groupBy('product_id')
                    ->map(static fn ($rows): array => $rows->pluck('id')->map(static fn ($id): int => (int) $id)->values()->all());
            }

            $products->setCollection(
                $products->getCollection()->map(function (Product $product) use ($matchedVariantIdsByProductId): Product {
                    $product->setAttribute('matched_variant_ids', $matchedVariantIdsByProductId->get((int) $product->id, []));

                    return $product;
                })
            );
        }

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'unique:products,slug'],
            'is_active' => ['nullable', 'boolean'],
            'is_new' => ['nullable', 'boolean'],
            'is_hit' => ['nullable', 'boolean'],
            'h1' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
            'seo_keyword' => ['nullable', 'string'],
        ]);

        $brand = Brand::query()->findOrFail((int) $validated['brand_id']);
        $slug = ProductDisplayName::resolveUniqueProductSlug(
            ProductDisplayName::buildSlug($brand->slug, $validated['name'])
        );
        if (Brand::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется брендом',
            ], 422);
        }

        $displayName = ProductDisplayName::format($brand->name, $validated['name']);

        $product = Product::create([
            'brand_id' => $validated['brand_id'],
            'main_category_id' => null,
            'name' => $validated['name'],
            'slug' => $slug,
            'h1' => $validated['h1'] ?: $displayName,
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $displayName,
            'seo_description' => $validated['seo_description'] ?? null,
            'seo_keyword' => $validated['seo_keyword'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'is_new' => (bool) ($validated['is_new'] ?? false),
            'is_hit' => (bool) ($validated['is_hit'] ?? false),
            'is_out_of_stock' => true,
            'sort_order' => 0,
        ]);

        $this->syncStockFlags($product);

        return response()->json([
            'message' => 'Продукт создан',
            'data' => $product->load(['brand'])->loadCount('variants'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        $validated = $request->validate([
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                Rule::unique('products', 'slug')->ignore($product->id),
            ],
            'is_active' => ['nullable', 'boolean'],
            'is_new' => ['nullable', 'boolean'],
            'is_hit' => ['nullable', 'boolean'],
            'h1' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
            'seo_keyword' => ['nullable', 'string'],
        ]);

        $slug = VanilleHelper::slugify($validated['slug']);
        if (Brand::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется брендом',
            ], 422);
        }

        $brand = Brand::query()->findOrFail((int) $validated['brand_id']);
        $displayName = ProductDisplayName::format($brand->name, $validated['name']);

        $product->update([
            'brand_id' => $validated['brand_id'],
            'name' => $validated['name'],
            'slug' => $slug,
            'h1' => $validated['h1'] ?: $displayName,
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $displayName,
            'seo_description' => $validated['seo_description'] ?? null,
            'seo_keyword' => $validated['seo_keyword'] ?? null,
            'is_active' => $validated['is_active'] ?? $product->is_active,
            'is_new' => (bool) ($validated['is_new'] ?? false),
            'is_hit' => (bool) ($validated['is_hit'] ?? false),
        ]);

        $this->syncStockFlags($product);

        return response()->json([
            'message' => 'Продукт обновлён',
            'data' => $product->fresh()->load(['brand'])->loadCount('variants'),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        $product->delete();

        return response()->json([
            'message' => 'Продукт удалён',
        ]);
    }

    public function brands(): JsonResponse
    {
        $brands = Brand::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        return response()->json([
            'data' => $brands,
        ]);
    }

    public function smartSearch(Request $request, CatalogProductLinkSearchService $linkSearch): JsonResponse
    {
        $query = trim($request->string('q')->toString());
        $limit = max(1, min((int) $request->input('limit', self::SMART_SEARCH_RESULT_LIMIT), self::SMART_SEARCH_RESULT_LIMIT));

        if (mb_strlen($query, 'UTF-8') < 2) {
            return response()->json(['data' => []]);
        }

        $brandId = $request->filled('brand_id') ? (int) $request->input('brand_id') : null;
        $ranked = $linkSearch->searchForAdminSmart($query, $brandId, $limit);

        return response()->json([
            'data' => $ranked,
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $product = Product::query()
            ->with([
                'brand',
                'images',
                'variants',
                'attributeValues.productAttribute.activeOptions',
                'attributeValues.selectedOptions.productAttributeOption',
            ])
            ->withCount('variants')
            ->findOrFail($id);

        $resolved = ProductDetailResource::make($product)->resolve();

        $legacyDetector = app(LegacyProductDetector::class);
        $legacyDetector->preload([(int) $product->id]);

        $pendingRetryTasks = ImportRetryItem::query()
            ->where('product_id', $product->id)
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->orderBy('task_type')
            ->pluck('task_type')
            ->map(static fn ($t) => (string) $t)
            ->values()
            ->all();

        return response()->json([
            'data' => array_merge($resolved, [
                'is_legacy_for_import' => $legacyDetector->isLegacy((int) $product->id),
                'import_retry_pending_tasks' => $pendingRetryTasks,
                'description_rewritten_at' => optional($product->description_rewritten_at)?->toIso8601String(),
            ]),
        ]);
    }

    public function rewriteDescription(
        int $id,
        ProductDescriptionRewriter $rewriter,
        ImportRetryQueue $retryQueue
    ): JsonResponse {
        $product = Product::query()->findOrFail($id);

        $result = $rewriter->rewriteProduct($product);
        if (! ($result['ok'] ?? false)) {
            $error = (string) ($result['error'] ?? 'unknown');

            return response()->json([
                'message' => $this->mapDescriptionRewriteErrorMessage($error),
                'error' => $error,
            ], 422);
        }

        DB::transaction(function () use ($product, $result, $retryQueue): void {
            $product->update([
                'description' => $result['description'],
                'description_rewritten_at' => now(),
            ]);
            $retryQueue->markResolved(ImportRetryItem::TASK_DESCRIPTION_REWRITE, (int) $product->id);
        });

        $fresh = $product->fresh();

        return response()->json([
            'message' => 'Описание обновлено (уникализация)',
            'data' => [
                'description' => $fresh?->description,
                'description_rewritten_at' => optional($fresh?->description_rewritten_at)?->toIso8601String(),
            ],
        ]);
    }

    private function mapDescriptionRewriteErrorMessage(string $error): string
    {
        if ($error === 'legacy_skip') {
            return 'Этот товар отмечен как legacy — уникализация описания недоступна.';
        }
        if ($error === 'source_too_short') {
            return 'Описание слишком короткое для уникализации (см. min_source_length в конфиге LLM).';
        }
        if (str_starts_with($error, 'llm:')) {
            return 'Ошибка LLM: '.mb_substr($error, 4);
        }
        if (str_starts_with($error, 'validation:')) {
            return 'Ответ модели не прошёл проверку: '.mb_substr($error, 11);
        }

        return 'Не удалось уникализировать описание: '.$error;
    }

    public function variantSuppliers(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        $variantIdFilter = (int) $request->query('variant_id', 0);

        $variantsQuery = ProductVariantLink::query()
            ->where('product_id', $product->id);

        if ($variantIdFilter > 0) {
            $belongs = ProductVariantLink::query()
                ->where('product_id', $product->id)
                ->whereKey($variantIdFilter)
                ->exists();
            if (! $belongs) {
                return response()->json([
                    'message' => 'Вариант не найден у этого товара',
                ], 404);
            }
            $variantsQuery->whereKey($variantIdFilter);
        }

        $variants = $variantsQuery
            ->with([
                'definition',
                'supplierOffers' => function ($query) {
                    $query->where('is_active', true)
                        ->with('supplier')
                        ->orderByDesc('last_seen_at')
                        ->orderByDesc('id');
                },
                'warehouseStocks.warehouse',
            ])
            ->get();

        $variants = VariantDefinitionVolume::sortVariantLinks($variants);

        $receiptItemsByVariant = StockReceiptItem::query()
            ->whereIn('variant_id', $variants->pluck('id')->all())
            ->with(['receipt.warehouse'])
            ->orderByDesc('id')
            ->get()
            ->groupBy('variant_id');

        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseRow = Warehouse::query()
            ->where('code', Warehouse::CODE_SUPPLIER)
            ->first(['id', 'name']);
        $supplierWarehouseId = (int) ($supplierWarehouseRow?->id ?? 0);
        $supplierWarehouseName = (string) ($supplierWarehouseRow?->name ?: 'Поставщик');
        $productName = ProductDisplayName::forProduct($product);

        $data = $variants->map(function (ProductVariantLink $variant) use (
            $receiptItemsByVariant,
            $productName,
            $mainWarehouseId,
            $supplierWarehouseId,
            $supplierWarehouseName
        ) {
            $receiptItems = $receiptItemsByVariant->get($variant->id, collect());
            $variantTitle = (string) ($variant->title ?? '');
            $catalogLine = trim($variantTitle) !== '' ? "{$productName} — {$variantTitle}" : $productName;

            $mainStoreRows = $receiptItems
                ->filter(function (StockReceiptItem $item) use ($mainWarehouseId) {
                    if ($mainWarehouseId <= 0) {
                        return false;
                    }
                    $wid = (int) ($item->receipt?->warehouse_id ?? 0);

                    return $wid === $mainWarehouseId && (int) ($item->qty ?? 0) > 0;
                })
                ->map(function (StockReceiptItem $item) use ($variant, $catalogLine) {
                    return [
                        'receipt_item_id' => $item->id,
                        'receipt_id' => $item->stock_receipt_id,
                        'receipt_document_no' => $item->receipt?->document_no,
                        'supplier_name' => 'Магазин',
                        'supplier_code' => (string) $variant->id,
                        'supplier_product_name' => $catalogLine,
                        'supplier_price' => $item->supplier_price,
                        'warehouse_name' => $item->receipt?->warehouse?->name ?? 'Основной',
                        'qty' => (int) ($item->qty ?? 0),
                        'received_at' => $item->receipt?->received_at?->toDateString(),
                    ];
                })
                ->values();

            $otherReceiptItems = $receiptItems->filter(function (StockReceiptItem $item) use ($mainWarehouseId) {
                if ($mainWarehouseId <= 0) {
                    return true;
                }
                $wid = (int) ($item->receipt?->warehouse_id ?? 0);

                return $wid !== $mainWarehouseId;
            });

            $supplierWarehouses = $variant->warehouseStocks
                ->filter(function ($stock) use ($mainWarehouseId) {
                    return (int) ($stock->stock ?? 0) > 0
                        && ($mainWarehouseId <= 0 || (int) ($stock->warehouse_id ?? 0) !== $mainWarehouseId);
                })
                ->map(function ($stock) {
                    return [
                        'warehouse_name' => $stock->warehouse?->name,
                        'stock' => (int) ($stock->stock ?? 0),
                        'available_stock' => (int) ($stock->available_stock ?? 0),
                    ];
                })
                ->values()
                ->all();

            $hasPhysicalSupplierShelf = false;
            if ($supplierWarehouseId > 0) {
                foreach ($variant->warehouseStocks as $stock) {
                    if ((int) ($stock->warehouse_id ?? 0) === $supplierWarehouseId && (int) ($stock->stock ?? 0) > 0) {
                        $hasPhysicalSupplierShelf = true;
                        break;
                    }
                }
            }

            if (
                $supplierWarehouseId > 0
                && CatalogVariantStockPresenter::supplierListingActive($variant)
                && !$hasPhysicalSupplierShelf
            ) {
                $supplierWarehouses[] = [
                    'warehouse_name' => $supplierWarehouseName.' (по прайсу)',
                    'stock' => CatalogVariantStockPresenter::SUPPLIER_LISTING_QTY,
                    'available_stock' => CatalogVariantStockPresenter::SUPPLIER_LISTING_QTY,
                    'virtual_price_channel' => true,
                ];
            }

            $mainStock = null;
            $supplierStock = null;
            foreach ($variant->warehouseStocks as $stockRow) {
                $wid = (int) ($stockRow->warehouse_id ?? 0);
                if ($mainWarehouseId > 0 && $wid === $mainWarehouseId) {
                    $mainStock = $stockRow;
                } elseif ($supplierWarehouseId > 0 && $wid === $supplierWarehouseId) {
                    $supplierStock = $stockRow;
                }
            }
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

            return [
                'id' => $variant->id,
                'title' => $variant->title,
                'is_active' => (bool) $variant->is_active,
                'is_preorder' => (bool) $variant->is_preorder,
                'is_promotion' => (bool) $variant->is_promotion,
                'site_price' => $variant->price,
                'stock' => (int) ($variant->stock ?? 0),
                'available_stock' => (int) $presented['available_stock'],
                'is_available' => (bool) $presented['is_available'],
                'fulfillment_tooltip' => ProductVariantResource::adminFulfillmentTooltip($variant, $mainStock, $supplierStock),
                'can_fulfill_main' => $mainStock
                    ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) > 0
                    : false,
                'can_fulfill_offer' => CatalogVariantStockPresenter::supplierListingActive($variant)
                    || (
                        $supplierStock
                        && max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) > 0
                    ),
                'warehouses' => $variant->warehouseStocks
                    ->filter(fn ($stock) => (int) ($stock->stock ?? 0) > 0)
                    ->map(function ($stock) {
                        return [
                            'warehouse_name' => $stock->warehouse?->name,
                            'stock' => (int) ($stock->stock ?? 0),
                            'available_stock' => (int) ($stock->available_stock ?? 0),
                        ];
                    })
                    ->values(),
                'supplier_warehouses' => $supplierWarehouses,
                'main_store_rows' => $mainStoreRows,
                'suppliers' => $variant->supplierOffers->map(function ($offer) {
                    $payload = is_array($offer->payload) ? $offer->payload : [];

                    return [
                        'offer_id' => $offer->id,
                        'supplier_name' => $offer->supplier?->name,
                        'supplier_code' => $offer->external_id,
                        'supplier_product_name' => $offer->external_product_name,
                        'supplier_price' => $payload['supplier_price'] ?? $offer->purchase_price,
                    ];
                })->values(),
                'receipt_batches' => $otherReceiptItems->map(function (StockReceiptItem $item) {
                    $payload = is_array($item->payload) ? $item->payload : [];

                    return [
                        'receipt_item_id' => $item->id,
                        'receipt_id' => $item->stock_receipt_id,
                        'receipt_document_no' => $item->receipt?->document_no,
                        'supplier_name' => $item->receipt?->supplier_name,
                        'supplier_code' => $item->supplier_sku,
                        'supplier_product_name' => $payload['supplier_product_name']
                            ?? $payload['name']
                            ?? $item->variant_title,
                        'supplier_price' => $item->supplier_price,
                        'warehouse_name' => $item->receipt?->warehouse?->name,
                        'qty' => (int) ($item->qty ?? 0),
                        'received_at' => $item->receipt?->received_at?->toDateString(),
                    ];
                })->values(),
            ];
        })->values();

        return response()->json([
            'data' => $data,
        ]);
    }

    public function resetApiCache(CatalogApiCacheService $cacheService): JsonResponse
    {
        $bump = $cacheService->bumpVersionDetailed();
        $warmExitCode = Artisan::call('catalog:warm-cache', ['--pages' => 3]);
        $warmed = $warmExitCode === 0;
        $storefront = $bump['storefront'];

        $message = 'Кеш каталога сброшен';
        if ($warmed) {
            $message .= ', прогрет';
        } else {
            $message .= ', прогрев завершился с ошибкой';
        }

        if ($storefront['status'] === 'ok') {
            $message .= ', витрина обновлена';
        } elseif ($storefront['status'] === 'skipped') {
            $message .= ' (HTTP revalidate витрины пропущен — настройте CATALOG_STOREFRONT_REVALIDATE_*)';
        } else {
            $message .= ' (HTTP revalidate витрины не удался)';
        }

        return response()->json([
            'message' => $message,
            'cache_version' => $bump['version'],
            'warmed' => $warmed,
            'storefront_revalidated' => $storefront['status'] === 'ok',
            'storefront_revalidate_status' => $storefront['status'],
            'storefront_revalidate_message' => $storefront['message'],
        ]);
    }

    private function syncStockFlags(Product $product): void
    {
        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);
    }

    /**
     * Вариант считается «с каналом продаж» для счётчика и фильтра списка товаров:
     * складской stock / предзаказ или активный оффер без блокирующих флагов в payload
     * (в т.ч. seller_one_listing_deferred — до «Обновить цены» такие офферы не считаются).
     *
     * @param  \Illuminate\Database\Eloquent\Builder<ProductVariantLink>  $variantQuery
     */
    private static function scopeAdminVariantHasSellableChannel(Builder $variantQuery): void
    {
        $variantQuery->where(function ($q) {
            $q->where('stock', '>', 0)
                ->orWhere('is_preorder', true)
                ->orWhereHas('supplierOffers', static function (Builder $sq): void {
                    CatalogVariantStockPresenter::applySupplierOfferListingScope($sq);
                });
        });
    }

}
