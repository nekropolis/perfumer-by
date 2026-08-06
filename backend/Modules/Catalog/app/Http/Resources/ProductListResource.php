<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Catalog\Support\VariantDefinitionVolume;

class ProductListResource extends JsonResource
{
    /**
     * Eager-load для листинга: сначала каталожные (до 2 на карточке), затем галерея с главной.
     *
     * @return \Closure(\Illuminate\Database\Eloquent\Builder<\Modules\Catalog\Models\ProductImage>): void
     */
    public static function imagesForListingEagerLoad(): \Closure
    {
        return static function ($q): void {
            $select = ['id', 'product_id', 'path', 'is_main', 'sort_order'];

            if (self::hasUsageTypeColumn()) {
                $select[] = 'usage_type';
            }

            if (ProductImagePathResolver::hasVariantColumns()) {
                $select[] = 'path_listing';
            }

            $q->select($select)
                ->when(
                    self::hasUsageTypeColumn(),
                    static fn ($query) => $query->orderByRaw("CASE WHEN usage_type = 'catalog' THEN 0 ELSE 1 END")
                )
                ->orderByDesc('is_main')
                ->orderBy('sort_order')
                ->limit(3);
        };
    }

    /**
     * @param  Collection<int, Product>  $products
     * @return list<array<string, mixed>>
     */
    public static function resolveCollection(Collection $products): array
    {
        if (CatalogListingStockContext::current() === null) {
            CatalogListingStockContext::prime($products);
        }
        try {
            return self::collection($products)->resolve();
        } finally {
            CatalogListingStockContext::forget();
        }
    }

    /**
     * @param  Collection<int, ProductVariantLink>  $variants
     * @return list<array<string, mixed>>
     */
    public static function resolvePromotionCollection(Collection $variants): array
    {
        CatalogListingStockContext::primeFromVariantLinks($variants);
        try {
            return $variants
                ->map(static fn (ProductVariantLink $variant): array => self::promotionVariantToArray($variant))
                ->values()
                ->all();
        } finally {
            CatalogListingStockContext::forget();
        }
    }

    public function toArray(Request $request): array
    {
        $variants = $this->listingVariantsCollection();

        $stockContext = CatalogListingStockContext::current()
            ?? CatalogListingStockContext::fromProducts(collect([$this->resource]));

        $variants = VariantDefinitionVolume::sortVariantLinks($variants);

        $presentedByVariant = [];
        foreach ($variants as $variant) {
            $presentedByVariant[(int) $variant->id] = $stockContext->presentedForListing($variant);
        }

        $prices = $variants
            ->map(function ($variant) use ($stockContext, $presentedByVariant) {
                $presented = $presentedByVariant[(int) $variant->id];

                return $stockContext->storefrontVariantPrice($variant, $presented);
            })
            ->filter();
        $oldPrices = $variants
            ->map(function ($variant) use ($stockContext, $presentedByVariant) {
                $presented = $presentedByVariant[(int) $variant->id];
                $price = $stockContext->storefrontVariantPrice($variant, $presented);

                return $price !== null ? $variant->old_price : null;
            })
            ->filter();

        $minPrice = $prices->isNotEmpty() ? $prices->min() : null;
        $maxPrice = $prices->isNotEmpty() ? $prices->max() : null;

        $minOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->min() : null;
        $maxOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->max() : null;

        $loyaltyEligibleVariants = $variants->filter(
            static fn ($variant): bool => !(bool) $variant->is_promotion
        );
        $loyaltyPrices = $loyaltyEligibleVariants
            ->map(function ($variant) use ($stockContext, $presentedByVariant) {
                $presented = $presentedByVariant[(int) $variant->id];

                return $stockContext->storefrontVariantPrice($variant, $presented);
            })
            ->filter();
        $loyaltyMinPrice = $loyaltyPrices->isNotEmpty() ? $loyaltyPrices->min() : null;
        $loyaltyMaxPrice = $loyaltyPrices->isNotEmpty() ? $loyaltyPrices->max() : null;

        $stockTotal = (int) $variants->sum(
            fn ($variant) => $presentedByVariant[(int) $variant->id]['stock']
        );
        $preorderAvailable = $variants->contains(fn ($variant) => (bool) $variant->is_preorder);

        $images = $this->relationLoaded('images') ? $this->images : collect();
        $catalogPaths = $images
            ->filter(static function ($image): bool {
                $usageType = (string) ($image->usage_type ?? '');
                if ($usageType === 'catalog') {
                    return true;
                }

                // Fallback для инстансов без новой колонки в БД:
                // считаем catalog-изображениями файлы из поддиректории /catalog/.
                return str_contains((string) ($image->path ?? ''), '/catalog/');
            })
            ->take(2)
            ->map(fn ($image) => ProductImagePathResolver::resolve($image, 'listing'))
            ->filter()
            ->values()
            ->all();

        $listingImagePath = $images->isNotEmpty()
            ? ProductImagePathResolver::resolve($images->first(), 'listing')
            : null;

        $discountPercent = null;
        if ($minOldPrice && $minPrice && $minOldPrice > $minPrice) {
            $discountPercent = (int) round((($minOldPrice - $minPrice) / $minOldPrice) * 100);
        }

        $variantLabels = $variants
            ->map(function ($variant) {
                $parts = [];

                if ($variant->volume) {
                    $parts[] = trim($variant->volume . ' ' . ($variant->volume_unit ?: 'ml'));
                }

                if ($variant->concentration) {
                    $parts[] = strtoupper($variant->concentration);
                } elseif ($variant->type) {
                    $parts[] = $variant->type;
                }

                if (!empty($parts)) {
                    return implode(' / ', $parts);
                }

                return $variant->title ?: null;
            })
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'display_name' => ProductDisplayName::format($this->brand?->name, (string) $this->name),
            'slug' => $this->slug,
            'h1' => $this->h1,
            'short_description' => $this->short_description,

            'brand' => $this->brand ? [
                'id' => $this->brand->id,
                'name' => $this->brand->name,
            ] : null,

            'main_category' => $this->mainCategory ? [
                'id' => $this->mainCategory->id,
                'name' => $this->mainCategory->name,
                'slug' => $this->mainCategory->slug,
            ] : null,

            'image' => $listingImagePath,

            'catalog_images' => $catalogPaths,

            'is_new' => $this->is_new,
            'is_hit' => $this->is_hit,
            'is_set' => (bool) $this->is_set,
            'is_out_of_stock' => (bool) $this->is_out_of_stock,

            'price_range' => [
                'min' => $minPrice,
                'max' => $maxPrice,
            ],

            'old_price_range' => [
                'min' => $minOldPrice,
                'max' => $maxOldPrice,
            ],

            'loyalty_price_range' => [
                'min' => $loyaltyMinPrice,
                'max' => $loyaltyMaxPrice,
            ],

            'has_discount' => $discountPercent !== null,
            'discount_percent' => $discountPercent,
            'has_promotion' => $variants->contains(static fn ($variant): bool => (bool) $variant->is_promotion),

            'stock_total' => $stockTotal,
            'is_preorder_available' => $preorderAvailable,
            'variants_count' => $variants->count(),
            'variant_labels' => $variantLabels,
            'listing_variant_id' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function promotionVariantToArray(ProductVariantLink $variant): array
    {
        $product = $variant->product;
        if ($product === null) {
            return [];
        }

        $stockContext = CatalogListingStockContext::current()
            ?? CatalogListingStockContext::fromProducts(collect([$product]));

        $presented = $stockContext->presentedForListing($variant);
        $price = $stockContext->storefrontVariantPrice($variant, $presented);
        $oldPrice = $price !== null ? $variant->old_price : null;

        $discountPercent = null;
        if ($oldPrice && $price && $oldPrice > $price) {
            $discountPercent = (int) round((($oldPrice - $price) / $oldPrice) * 100);
        }

        $variantLabel = self::buildVariantLabel($variant);
        $variantLabels = $variantLabel !== null ? [$variantLabel] : [];

        $images = $product->relationLoaded('images') ? $product->images : collect();
        $catalogPaths = $images
            ->filter(static function ($image): bool {
                $usageType = (string) ($image->usage_type ?? '');
                if ($usageType === 'catalog') {
                    return true;
                }

                return str_contains((string) ($image->path ?? ''), '/catalog/');
            })
            ->take(2)
            ->map(fn ($image) => ProductImagePathResolver::resolve($image, 'listing'))
            ->filter()
            ->values()
            ->all();

        $listingImagePath = $images->isNotEmpty()
            ? ProductImagePathResolver::resolve($images->first(), 'listing')
            : null;

        return [
            'id' => $product->id,
            'name' => $product->name,
            'display_name' => ProductDisplayName::format($product->brand?->name, (string) $product->name),
            'slug' => $product->slug,
            'h1' => $product->h1,
            'short_description' => $product->short_description,

            'brand' => $product->brand ? [
                'id' => $product->brand->id,
                'name' => $product->brand->name,
            ] : null,

            'main_category' => $product->mainCategory ? [
                'id' => $product->mainCategory->id,
                'name' => $product->mainCategory->name,
                'slug' => $product->mainCategory->slug,
            ] : null,

            'image' => $listingImagePath,
            'catalog_images' => $catalogPaths,

            'is_new' => $product->is_new,
            'is_hit' => $product->is_hit,
            'is_set' => (bool) $product->is_set,
            'is_out_of_stock' => (bool) $product->is_out_of_stock,

            'price_range' => [
                'min' => $price,
                'max' => $price,
            ],

            'old_price_range' => [
                'min' => $oldPrice,
                'max' => $oldPrice,
            ],

            'loyalty_price_range' => [
                'min' => null,
                'max' => null,
            ],

            'has_discount' => $discountPercent !== null,
            'discount_percent' => $discountPercent,
            'has_promotion' => true,

            'stock_total' => (int) ($presented['stock'] ?? 0),
            'is_preorder_available' => (bool) $variant->is_preorder,
            'variants_count' => 1,
            'variant_labels' => $variantLabels,
            'listing_variant_id' => (int) $variant->id,
        ];
    }

    /**
     * @param  ProductVariantLink|\Illuminate\Database\Eloquent\Model  $variant
     */
    private static function buildVariantLabel($variant): ?string
    {
        if ($variant->definition?->is_set || (bool) ($variant->is_set ?? false)) {
            return 'Набор';
        }

        $parts = [];

        if ($variant->volume) {
            $parts[] = trim($variant->volume . ' ' . ($variant->volume_unit ?: 'ml'));
        }

        if ($variant->concentration) {
            $parts[] = strtoupper($variant->concentration);
        } elseif ($variant->type) {
            $parts[] = $variant->type;
        }

        if (!empty($parts)) {
            return implode(' / ', $parts);
        }

        return $variant->title ?: null;
    }

    private static function hasUsageTypeColumn(): bool
    {
        static $hasColumn = null;

        if ($hasColumn !== null) {
            return $hasColumn;
        }

        try {
            $hasColumn = Schema::hasColumn('product_images', 'usage_type');
        } catch (\Throwable) {
            $hasColumn = false;
        }

        return $hasColumn;
    }

    /**
     * @return \Illuminate\Support\Collection<int, ProductVariantLink>
     */
    private function listingVariantsCollection(): \Illuminate\Support\Collection
    {
        if ($this->relationLoaded('variants')) {
            return $this->variants;
        }

        if ($this->relationLoaded('activeVariants')) {
            return $this->activeVariants;
        }

        return collect();
    }
}
