<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Warehouse\Models\StockReceiptItem;
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
                    $variantQuery->where(function ($q) {
                        $q->where('stock', '>', 0)
                            ->orWhere('is_preorder', true);
                    });
                },
            ]);

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $stem = trim((string) preg_replace('/\s+-\s*.*$/u', '', $search)) ?: $search;

            $query->where(function ($q) use ($search, $stem) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
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
                    $variantQuery->where(function ($availableQuery) {
                        $availableQuery
                            ->where('stock', '>', 0)
                            ->orWhere('is_preorder', true);
                    });
                });
            } elseif ($outOfStock === '0') {
                $query->whereHas('variants', function ($variantQuery) {
                    $variantQuery->where(function ($availableQuery) {
                        $availableQuery
                            ->where('stock', '>', 0)
                            ->orWhere('is_preorder', true);
                    });
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
        $pool = Product::query()
            ->with(['brand:id,name', 'variants:id,product_id,title'])
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_POOL_LIMIT)
            ->get(['id', 'brand_id', 'name', 'slug']);

        $ranked = $pool->map(function (Product $product) use ($normalizedQuery) {
            $name = (string) $product->name;
            $slug = (string) $product->slug;
            $brandName = (string) ($product->brand?->name ?? '');
            $variants = $product->variants?->pluck('title')->filter()->values() ?? collect();

            $scoreName = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($name));
            $scoreSlug = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($slug));
            $scoreBrand = $brandName !== '' ? $this->similarityScore($normalizedQuery, $this->normalizeSearchText($brandName)) : 0.0;
            $scoreVariant = $variants->reduce(function (float $carry, $variantTitle) use ($normalizedQuery) {
                $score = $this->similarityScore($normalizedQuery, $this->normalizeSearchText((string) $variantTitle));
                return max($carry, $score);
            }, 0.0);

            $bestScore = max($scoreName, $scoreSlug * 0.95, $scoreBrand * 0.8, $scoreVariant * 0.9);

            if ($bestScore < 0.18) {
                return null;
            }

            return [
                'id' => (int) $product->id,
                'name' => $name,
                'brand_name' => $brandName !== '' ? $brandName : null,
                'variant_titles' => $variants->take(5)->values()->all(),
                'score' => round($bestScore, 6),
            ];
        })
            ->filter()
            ->sortByDesc('score')
            ->take($limit)
            ->values()
            ->all();

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

        return response()->json([
            'data' => ProductDetailResource::make($product)->resolve(),
        ]);
    }

    public function variantSuppliers(int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        $variants = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->where('is_active', true)
            ->where('stock', '>', 0)
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

        $data = $variants->map(function (ProductVariantLink $variant) use ($receiptItemsByVariant) {
            $receiptItems = $receiptItemsByVariant->get($variant->id, collect());

            return [
                'id' => $variant->id,
                'title' => $variant->title,
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
                'receipt_batches' => $receiptItems->map(function (StockReceiptItem $item) {
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
}
