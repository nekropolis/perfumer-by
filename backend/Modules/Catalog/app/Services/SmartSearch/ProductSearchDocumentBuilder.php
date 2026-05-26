<?php

namespace Modules\Catalog\Services\SmartSearch;

use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

class ProductSearchDocumentBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(Product $product): array
    {
        $variantLabels = $product->variants
            ->map(static fn ($variant): string => (string) ($variant->definition?->title ?? ''))
            ->filter(static fn (string $title): bool => $title !== '')
            ->unique()
            ->values()
            ->all();

        $prices = $product->variants
            ->pluck('price')
            ->filter(static fn ($value): bool => $value !== null)
            ->map(static fn ($value): float => (float) $value)
            ->values();

        $hasStock = (int) ($product->activeVariants?->sum('stock') ?? 0) > 0;
        $preorderAvailable = (bool) ($product->activeVariants?->contains(fn ($variant) => (bool) $variant->is_preorder) ?? false);

        $display = ProductDisplayName::forProduct($product);

        return [
            'id' => (int) $product->id,
            'name' => (string) $product->name,
            'slug' => (string) $product->slug,
            'display_title' => $display,
            'brand_name' => (string) ($product->brand?->name ?? ''),
            'brand_slug' => (string) ($product->brand?->slug ?? ''),
            'variant_labels' => $variantLabels,
            'is_active' => (bool) $product->is_active,
            'is_new' => (bool) $product->is_new,
            'is_hit' => (bool) $product->is_hit,
            'is_out_of_stock' => (bool) $product->is_out_of_stock,
            'is_preorder_available' => $preorderAvailable,
            'has_stock' => $hasStock,
            'min_price' => $prices->isEmpty() ? null : (float) $prices->min(),
            'max_price' => $prices->isEmpty() ? null : (float) $prices->max(),
            'updated_at_ts' => $product->updated_at?->getTimestamp() ?? time(),
        ];
    }
}
