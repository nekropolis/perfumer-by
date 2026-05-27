<?php

namespace Modules\Catalog\Support;

use Modules\Catalog\Models\ProductImage;

/**
 * Vanille на листинге отдаёт hover (-2) раньше основного (-1) в HTML.
 * После ошибочного импорта у товара «главная» каталожная может оказаться на -2.
 */
final class VanilleCatalogListingImageOrder
{
    public const SLOT_PRIMARY = 'primary';

    public const SLOT_SECONDARY = 'secondary';

    public static function reference(ProductImage $image): string
    {
        $sourceUrl = trim((string) ($image->source_url ?? ''));
        if ($sourceUrl !== '') {
            return $sourceUrl;
        }

        return trim((string) ($image->path ?? ''));
    }

    public static function slot(string $reference): ?string
    {
        $reference = trim($reference);
        if ($reference === '') {
            return null;
        }

        $path = parse_url($reference, PHP_URL_PATH);
        $basename = basename(is_string($path) && $path !== '' ? $path : $reference);

        if (preg_match('/-1\.(webp|jpe?g|png)$/iu', $basename)) {
            return self::SLOT_PRIMARY;
        }

        if (preg_match('/-2\.(webp|jpe?g|png)$/iu', $basename)) {
            return self::SLOT_SECONDARY;
        }

        return null;
    }

    /**
     * @param  list<ProductImage>  $catalogImages  Ровно 2 каталожных изображения.
     */
    public static function needsSwap(array $catalogImages): bool
    {
        if (count($catalogImages) !== 2) {
            return false;
        }

        $slots = [];
        foreach ($catalogImages as $image) {
            $slot = self::slot(self::reference($image));
            if ($slot === null) {
                return false;
            }
            $slots[$image->id] = $slot;
        }

        $main = collect($catalogImages)->first(fn (ProductImage $image) => (bool) $image->is_main);
        if (! $main instanceof ProductImage) {
            $main = collect($catalogImages)->sortBy('sort_order')->first();
        }

        if (! $main instanceof ProductImage) {
            return false;
        }

        $other = collect($catalogImages)->first(fn (ProductImage $image) => $image->id !== $main->id);
        if (! $other instanceof ProductImage) {
            return false;
        }

        return ($slots[$main->id] ?? null) === self::SLOT_SECONDARY
            && ($slots[$other->id] ?? null) === self::SLOT_PRIMARY;
    }

    /**
     * @param  list<ProductImage>  $catalogImages
     * @return array{primary: ProductImage, secondary: ProductImage}|null
     */
    public static function resolvePair(array $catalogImages): ?array
    {
        if (count($catalogImages) !== 2) {
            return null;
        }

        $primary = null;
        $secondary = null;

        foreach ($catalogImages as $image) {
            $slot = self::slot(self::reference($image));
            if ($slot === self::SLOT_PRIMARY) {
                $primary = $image;
            } elseif ($slot === self::SLOT_SECONDARY) {
                $secondary = $image;
            }
        }

        if (! $primary instanceof ProductImage || ! $secondary instanceof ProductImage) {
            return null;
        }

        return [
            'primary' => $primary,
            'secondary' => $secondary,
        ];
    }
}
