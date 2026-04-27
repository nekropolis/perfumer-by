<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Http\Resources\ProductVariantResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockInventoryService;

class ProductAdminController extends Controller
{
    private const SMART_SEARCH_POOL_LIMIT = 1200;
    private const SMART_SEARCH_RESULT_LIMIT = 40;

    public function index(Request $request): JsonResponse
    {
        $query = Product::query()
            ->with(['brand'])
            ->withCount('variants')
            ->withCount([
                'variants as discounted_variants_count' => function ($variantQuery) {
                    $variantQuery
                        ->whereNotNull('old_price')
                        ->whereNotNull('price')
                        ->whereColumn('old_price', '>', 'price');
                },
                'variants as variants_with_stock_count' => function ($variantQuery) {
                    self::scopeAdminVariantHasSellableChannel($variantQuery);
                },
            ]);

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $stem = trim((string) preg_replace('/\s+-\s*.*$/u', '', $search)) ?: $search;

            $query->where(function ($q) use ($search, $stem) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhereHas('variants.definition', function ($def) use ($search) {
                        $def->where('title', 'like', "%{$search}%")
                            ->orWhere('concentration_label', 'like', "%{$search}%")
                            ->orWhere('concentration_code', 'like', "%{$search}%");
                    });
                if (mb_strtolower($stem, 'UTF-8') !== mb_strtolower($search, 'UTF-8')) {
                    // «Gucci Guilty - 90 ml» не матчит LIKE по имени «Gucci Guilty» — добавляем точное имя по stem.
                    $q->orWhereRaw('LOWER(TRIM(`name`)) = LOWER(?)', [$stem]);
                }
            });

            // Сортировка: точное имя (полная строка или stem) и slug выше частичных совпадений, затем id.

            $bindings = [
                $search,
                $stem,
                $search,
                $stem,
                $search . '%',
            ];
            $relevanceCase = '(CASE
                WHEN LOWER(TRIM(`name`)) = LOWER(?) OR LOWER(TRIM(`name`)) = LOWER(?) THEN 0
                WHEN LOWER(TRIM(`slug`)) = LOWER(?) OR LOWER(TRIM(`slug`)) = LOWER(?) THEN 1
                WHEN LOWER(`name`) LIKE LOWER(?) THEN 2';

            if (mb_strtolower($stem, 'UTF-8') !== mb_strtolower($search, 'UTF-8')) {
                $bindings[] = $stem . '%';
                $relevanceCase .= '
                WHEN LOWER(`name`) LIKE LOWER(?) THEN 3
                ELSE 4 END)';
            } else {
                $relevanceCase .= '
                ELSE 3 END)';
            }

            $query->orderByRaw($relevanceCase, $bindings);
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
                    $variantQuery
                        ->whereNotNull('old_price')
                        ->whereNotNull('price')
                        ->whereColumn('old_price', '>', 'price');
                });
            }
        }

        $products = $query
            ->when($request->filled('search'), fn ($q) => $q->orderByDesc('id'))
            ->paginate(20);

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
        ]);

        $slug = VanilleHelper::slugify($validated['slug']);
        if (Brand::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется брендом',
            ], 422);
        }

        $product = Product::create([
            'brand_id' => $validated['brand_id'],
            'main_category_id' => null,
            'name' => $validated['name'],
            'slug' => $slug,
            'h1' => $validated['h1'] ?: $validated['name'],
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $validated['name'],
            'seo_description' => $validated['seo_description'] ?? null,
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
        ]);

        $slug = VanilleHelper::slugify($validated['slug']);
        if (Brand::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется брендом',
            ], 422);
        }

        $product->update([
            'brand_id' => $validated['brand_id'],
            'name' => $validated['name'],
            'slug' => $slug,
            'h1' => $validated['h1'] ?: $validated['name'],
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $validated['name'],
            'seo_description' => $validated['seo_description'] ?? null,
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

    public function smartSearch(Request $request): JsonResponse
    {
        $query = trim($request->string('q')->toString());
        $limit = max(1, min((int) $request->input('limit', self::SMART_SEARCH_RESULT_LIMIT), self::SMART_SEARCH_RESULT_LIMIT));

        if (mb_strlen($query, 'UTF-8') < 2) {
            return response()->json(['data' => []]);
        }

        $normalizedQuery = $this->normalizeSearchText($query);
        $eager = $this->adminSmartSearchProductEagerLoads();
        $escaped = addcslashes($query, '%_\\');
        $needle = '%'.$escaped.'%';

        $likeMatches = Product::query()
            ->select(['id', 'brand_id', 'name', 'slug'])
            ->with($eager)
            ->where(function ($q) use ($needle) {
                $q->where('name', 'like', $needle)
                    ->orWhere('slug', 'like', $needle)
                    ->orWhereHas('variants.definition', function ($def) use ($needle) {
                        $def->where('title', 'like', $needle)
                            ->orWhere('concentration_label', 'like', $needle)
                            ->orWhere('concentration_code', 'like', $needle);
                    });
            })
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_POOL_LIMIT)
            ->get();

        if ($likeMatches->count() >= 80) {
            $pool = $likeMatches;
        } else {
            $fallback = Product::query()
                ->select(['id', 'brand_id', 'name', 'slug'])
                ->with($eager)
                ->orderByDesc('id')
                ->limit(self::SMART_SEARCH_POOL_LIMIT)
                ->get();
            $byId = $likeMatches->keyBy('id');
            foreach ($fallback as $p) {
                if ($byId->count() >= self::SMART_SEARCH_POOL_LIMIT) {
                    break;
                }
                if (!$byId->has($p->id)) {
                    $byId->put($p->id, $p);
                }
            }
            $pool = $byId->values();
        }

        [$stocksByVariant, $mainWarehouseId, $supplierWarehouseId] = $this->batchWarehouseStocksByVariantIds(
            $pool->flatMap(static fn (Product $p) => $p->variants->pluck('id'))->unique()->filter()->values()->all()
        );

        $ranked = $pool->map(function (Product $product) use ($normalizedQuery, $stocksByVariant, $mainWarehouseId, $supplierWarehouseId) {
            $name = (string) $product->name;
            $slug = (string) $product->slug;
            $brandName = (string) ($product->brand?->name ?? '');
            $variantTitles = $product->variants?->pluck('title')->filter()->values() ?? collect();
            $variantSlices = collect();
            foreach ($product->variants ?? [] as $link) {
                $d = $link->definition;
                if (!$d) {
                    continue;
                }
                foreach ([$d->title, $d->concentration_label, $d->concentration_code] as $piece) {
                    if ($piece !== null && trim((string) $piece) !== '') {
                        $variantSlices->push((string) $piece);
                    }
                }
            }

            $scoreName = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($name));
            $scoreSlug = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($slug));
            $scoreBrand = $brandName !== '' ? $this->similarityScore($normalizedQuery, $this->normalizeSearchText($brandName)) : 0.0;
            $scoreVariant = $variantSlices->reduce(function (float $carry, string $piece) use ($normalizedQuery) {
                $score = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($piece));

                return max($carry, $score);
            }, 0.0);

            $bestScore = max($scoreName, $scoreSlug * 0.95, $scoreBrand * 0.8, $scoreVariant * 0.9);

            if ($bestScore < 0.10) {
                return null;
            }

            return [
                'id' => (int) $product->id,
                'name' => $name,
                'brand_name' => $brandName !== '' ? $brandName : null,
                'variant_titles' => $variantTitles->take(5)->values()->all(),
                'variants_preview' => $this->smartSearchVariantLines(
                    $product->variants->take(5),
                    $stocksByVariant,
                    $mainWarehouseId,
                    $supplierWarehouseId
                ),
                'score' => round($bestScore, 6),
            ];
        })
            ->filter()
            ->sortByDesc('score')
            ->take($limit)
            ->values()
            ->all();

        $ranked = $this->appendAdminSmartSearchSkuAndIdHits($query, $ranked, $limit);

        return response()->json([
            'data' => $ranked,
        ]);
    }

    /**
     * Добавляет совпадения по числовому id товара и по SKU из прайса поставщика (для ручного заказа в админке).
     *
     * @param  list<array<string, mixed>>  $ranked
     * @return list<array<string, mixed>>
     */
    private function appendAdminSmartSearchSkuAndIdHits(string $rawQuery, array $ranked, int $limit): array
    {
        $byId = [];
        foreach ($ranked as $row) {
            $byId[(int) $row['id']] = $row;
        }

        $trim = trim($rawQuery);
        if (preg_match('/^\d{1,12}$/', $trim) && (int) $trim > 0) {
            $pid = (int) $trim;
            $product = Product::query()
                ->with($this->adminSmartSearchProductEagerLoads())
                ->find($pid);
            if ($product) {
                $variants = $product->variants?->pluck('title')->filter()->values() ?? collect();
                [$stByV, $mw, $sw] = $this->batchWarehouseStocksByVariantIds(
                    $product->variants->take(5)->pluck('id')->filter()->values()->all()
                );
                $byId[$product->id] = [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                    'brand_name' => $product->brand?->name ? (string) $product->brand->name : null,
                    'variant_titles' => $variants->take(5)->values()->all(),
                    'variants_preview' => $this->smartSearchVariantLines(
                        $product->variants->take(5),
                        $stByV,
                        $mw,
                        $sw
                    ),
                    'score' => 1.0,
                ];
            }
        }

        if (mb_strlen($trim, 'UTF-8') >= 2) {
            $escaped = addcslashes($trim, '%_\\');
            $productIds = SupplierVariantOffer::query()
                ->where('supplier_variant_offers.is_active', true)
                ->whereNotNull('supplier_variant_offers.sku')
                ->where('supplier_variant_offers.sku', 'like', '%'.$escaped.'%')
                ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
                ->select('product_variant_links.product_id')
                ->distinct()
                ->limit(25)
                ->pluck('product_variant_links.product_id');

            foreach ($productIds as $pid) {
                $pid = (int) $pid;
                if ($pid <= 0 || isset($byId[$pid])) {
                    continue;
                }
                $product = Product::query()
                    ->with($this->adminSmartSearchProductEagerLoads())
                    ->find($pid);
                if (!$product) {
                    continue;
                }
                $variants = $product->variants?->pluck('title')->filter()->values() ?? collect();
                [$stByV, $mw, $sw] = $this->batchWarehouseStocksByVariantIds(
                    $product->variants->take(5)->pluck('id')->filter()->values()->all()
                );
                $byId[$pid] = [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                    'brand_name' => $product->brand?->name ? (string) $product->brand->name : null,
                    'variant_titles' => $variants->take(5)->values()->all(),
                    'variants_preview' => $this->smartSearchVariantLines(
                        $product->variants->take(5),
                        $stByV,
                        $mw,
                        $sw
                    ),
                    'score' => 0.35,
                ];
            }
        }

        $merged = array_values($byId);
        usort($merged, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        return array_slice($merged, 0, $limit);
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

        return response()->json([
            'data' => ProductDetailResource::make($product)->resolve(),
        ]);
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
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

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
        $productName = (string) $product->name;

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
                    'stock' => 999,
                    'available_stock' => 999,
                    'virtual_price_channel' => true,
                ];
            }

            return [
                'id' => $variant->id,
                'title' => $variant->title,
                'is_active' => (bool) $variant->is_active,
                'is_preorder' => (bool) $variant->is_preorder,
                'site_price' => $variant->price,
                'stock' => (int) ($variant->stock ?? 0),
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
        $version = $cacheService->bumpVersion();

        return response()->json([
            'message' => 'Кеш каталога принудительно сброшен',
            'cache_version' => $version,
        ]);
    }

    private function syncStockFlags(Product $product): void
    {
        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);
    }

    /**
     * @param  list<int>  $variantIds
     * @return array{0: Collection<int, Collection<int, WarehouseVariantStock>>, 1: int, 2: int}
     */
    private function batchWarehouseStocksByVariantIds(array $variantIds): array
    {
        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');

        if ($variantIds === []) {
            return [collect(), $mainWarehouseId, $supplierWarehouseId];
        }

        $rows = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get();

        return [
            $rows->groupBy('variant_id')->map(static fn ($g) => $g->keyBy('warehouse_id')),
            $mainWarehouseId,
            $supplierWarehouseId,
        ];
    }

    /**
     * @param  iterable<ProductVariantLink>  $variants
     * @param  Collection<int, Collection<int, WarehouseVariantStock>>  $stocksByVariant
     * @return list<array{title: string, availability: string, available_stock: int, is_available: bool, is_preorder: bool}>
     */
    private function smartSearchVariantLines(
        iterable $variants,
        Collection $stocksByVariant,
        int $mainWarehouseId,
        int $supplierWarehouseId,
    ): array {
        $out = [];
        foreach ($variants as $link) {
            $byW = $stocksByVariant->get($link->id, collect());
            $mainStock = $mainWarehouseId > 0 ? $byW->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $byW->get($supplierWarehouseId) : null;
            $presented = CatalogVariantStockPresenter::forListing($link, $mainStock, $supplierStock);
            $out[] = [
                'title' => (string) $link->title,
                'availability' => ProductVariantResource::adminFulfillmentTooltip($link, $mainStock, $supplierStock),
                'available_stock' => (int) $presented['available_stock'],
                'is_available' => (bool) $presented['is_available'],
                'is_preorder' => (bool) $presented['is_preorder'],
            ];
        }

        return $out;
    }

    /**
     * Для smart-search: у `product_variant_links` нет колонки title — она в `variant_definitions`.
     *
     * @return array<string, mixed>
     */
    private function adminSmartSearchProductEagerLoads(): array
    {
        return [
            'brand:id,name',
            'variants' => static function ($q): void {
                $q->select(['id', 'product_id', 'variant_definition_id'])
                    ->with(['definition:id,title,concentration_code,concentration_label,volume_ml']);
            },
        ];
    }

    private function normalizeSearchText(string $value): string
    {
        $value = mb_strtolower($value, 'UTF-8');
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?? '';
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';
        return trim($value);
    }

    private function similarityScore(string $needle, string $haystack): float
    {
        if ($needle === '' || $haystack === '') {
            return 0.0;
        }
        if ($needle === $haystack) {
            return 1.0;
        }
        if (str_contains($haystack, $needle)) {
            return 0.96;
        }

        $needleTokens = array_values(array_filter(explode(' ', $needle)));
        $haystackTokens = array_values(array_filter(explode(' ', $haystack)));

        $tokenScoreSum = 0.0;
        foreach ($needleTokens as $needleToken) {
            $bestTokenScore = $this->diceCoefficient($needleToken, $haystack);
            foreach ($haystackTokens as $haystackToken) {
                $bestTokenScore = max($bestTokenScore, $this->diceCoefficient($needleToken, $haystackToken));
            }
            $tokenScoreSum += $bestTokenScore;
        }

        $avgTokenScore = $tokenScoreSum / max(1, count($needleTokens));
        $phraseScore = $this->diceCoefficient($needle, $haystack);

        return max($avgTokenScore, $phraseScore * 0.9);
    }

    private function diceCoefficient(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }
        if ($a === $b) {
            return 1.0;
        }

        $aBigrams = $this->mbBigrams($a);
        $bBigrams = $this->mbBigrams($b);

        if (empty($aBigrams) || empty($bBigrams)) {
            return 0.0;
        }

        $aCounts = array_count_values($aBigrams);
        $bCounts = array_count_values($bBigrams);
        $intersection = 0;

        foreach ($aCounts as $gram => $count) {
            if (!isset($bCounts[$gram])) {
                continue;
            }
            $intersection += min($count, $bCounts[$gram]);
        }

        return (2 * $intersection) / (count($aBigrams) + count($bBigrams));
    }

    /**
     * @return string[]
     */
    private function mbBigrams(string $value): array
    {
        $length = mb_strlen($value, 'UTF-8');
        if ($length < 2) {
            return [];
        }

        $grams = [];
        for ($i = 0; $i < $length - 1; $i++) {
            $grams[] = mb_substr($value, $i, 2, 'UTF-8');
        }

        return $grams;
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
                    self::applyAdminSupplierOfferListingFilters($sq);
                });
        });
    }

    /**
     * @param  Builder<\Modules\Catalog\Models\SupplierVariantOffer>  $sq
     */
    private static function applyAdminSupplierOfferListingFilters(Builder $sq): void
    {
        $sq->where('is_active', true)
            ->where(function ($w) {
                $w->whereNull('payload->missing_in_latest_price')
                    ->orWhere('payload->missing_in_latest_price', false);
            })
            ->where(function ($w) {
                $w->whereNull('payload->out_of_stock_in_price_file')
                    ->orWhere('payload->out_of_stock_in_price_file', false);
            })
            ->where(function ($w) {
                $w->whereNull('payload->seller_one_listing_deferred')
                    ->orWhere('payload->seller_one_listing_deferred', false);
            });
    }
}
