<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

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
                ->limit(8);
        };
    }

    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('activeVariants')
            ? $this->activeVariants
            : collect();

        $mainWarehouseId = self::warehouseIdByCode(Warehouse::CODE_MAIN);
        $supplierWarehouseId = self::warehouseIdByCode(Warehouse::CODE_SUPPLIER);
        $variantIds = $variants->pluck('id')->filter()->values();

        $stocks = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get()
            ->groupBy('variant_id');

        $prices = $variants->map(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

            return CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);
        })->filter();
        $oldPrices = $variants
            ->map(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
                $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
                $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
                $p = CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);

                return $p !== null ? $variant->old_price : null;
            })
            ->filter();

        $minPrice = $prices->isNotEmpty() ? $prices->min() : null;
        $maxPrice = $prices->isNotEmpty() ? $prices->max() : null;

        $minOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->min() : null;
        $maxOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->max() : null;

        $stockTotal = (int) $variants->sum(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;

            return CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock)['stock'];
        });
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
            'is_out_of_stock' => (bool) $this->is_out_of_stock,

            'price_range' => [
                'min' => $minPrice,
                'max' => $maxPrice,
            ],

            'old_price_range' => [
                'min' => $minOldPrice,
                'max' => $maxOldPrice,
            ],

            'has_discount' => $discountPercent !== null,
            'discount_percent' => $discountPercent,

            'stock_total' => $stockTotal,
            'is_preorder_available' => $preorderAvailable,
            'variants_count' => $variants->count(),
            'variant_labels' => $variantLabels,
        ];
    }

    /**
     * Warehouse id by code, memoized per request so the listing does not
     * re-query the same lookup for every product in the collection.
     */
    private static function warehouseIdByCode(string $code): int
    {
        static $cache = [];

        if (!array_key_exists($code, $cache)) {
            $cache[$code] = (int) Warehouse::query()->where('code', $code)->value('id');
        }

        return $cache[$code];
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
}
