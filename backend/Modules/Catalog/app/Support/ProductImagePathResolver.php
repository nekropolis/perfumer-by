<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\ProductImage;

class ProductImagePathResolver
{
    public static function hasVariantColumns(): bool
    {
        static $has = null;
        if ($has !== null) {
            return $has;
        }

        try {
            $has = Schema::hasColumn('product_images', 'path_full');
        } catch (\Throwable) {
            $has = false;
        }

        return $has;
    }

    public static function resolve(ProductImage $image, string $variant): string
    {
        $value = match ($variant) {
            'listing' => $image->path_listing,
            'card' => $image->path_card,
            'thumb' => $image->path_thumb,
            'full' => $image->path_full,
            default => null,
        };

        if (is_string($value) && $value !== '') {
            return $value;
        }

        if ($variant === 'thumb') {
            $listing = $image->path_listing;
            if (is_string($listing) && $listing !== '') {
                return $listing;
            }
        }

        return (string) $image->path;
    }
}
