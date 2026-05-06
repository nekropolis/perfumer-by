<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductImage;

class ProductImageAdminService
{
    private static function hasExtendedProductImageColumns(): bool
    {
        return Schema::hasColumn('product_images', 'usage_type');
    }

    /**
     * @param UploadedFile[] $files
     */
    public function upload(Product $product, array $files, ?string $usageType = null): array
    {
        $usageType = $usageType === ProductImage::USAGE_CATALOG ? ProductImage::USAGE_CATALOG : ProductImage::USAGE_GALLERY;

        if ($usageType === ProductImage::USAGE_CATALOG && ! self::hasExtendedProductImageColumns()) {
            throw ValidationException::withMessages([
                'usage_type' => ['В базе нет поля usage_type для product_images. Примените миграции.'],
            ]);
        }

        DB::transaction(function () use ($product, $files, $usageType): void {
            if ($usageType === ProductImage::USAGE_CATALOG) {
                $existingCatalog = (int) ProductImage::query()
                    ->where('product_id', $product->id)
                    ->where('usage_type', ProductImage::USAGE_CATALOG)
                    ->count();
                if ($existingCatalog + count($files) > 2) {
                    throw ValidationException::withMessages([
                        'images' => ['Каталожных изображений может быть не более двух.'],
                    ]);
                }
            }

            $currentMaxSortOrder = (int) ($product->images()->max('sort_order') ?? -1);
            $disk = Storage::disk('public');
            $directory = 'products/' . $product->id;
            $slugBase = Str::slug((string) $product->name);
            if ($slugBase === '') {
                $slugBase = 'product-image';
            }
            $nextNumber = (int) $product->images()->count() + 1;

            foreach ($files as $index => $file) {
                $extension = strtolower((string) $file->getClientOriginalExtension());
                if ($extension === '') {
                    $extension = 'webp';
                }

                $filename = $this->buildSeoFilename($disk, $directory, $slugBase, $nextNumber, $extension);
                $storedPath = $file->storeAs($directory, $filename, 'public');
                $nextNumber++;

                $row = [
                    'product_id' => $product->id,
                    'path' => 'storage/' . ltrim($storedPath, '/'),
                    'alt' => $this->buildAltText((string) $product->name, $nextNumber - 1),
                    'sort_order' => $currentMaxSortOrder + $index + 1,
                    'is_main' => false,
                ];
                if (self::hasExtendedProductImageColumns()) {
                    $row['usage_type'] = $usageType;
                    $row['source_url'] = null;
                    $row['watermark_status'] = ProductImage::WATERMARK_NONE;
                    $row['watermark_meta'] = null;
                }
                ProductImage::query()->create($row);
            }

            $hasMainImage = $product->images()->where('is_main', true)->exists();
            if (!$hasMainImage) {
                $firstImage = $product->images()->orderBy('sort_order')->orderBy('id')->first();
                if ($firstImage) {
                    $firstImage->update(['is_main' => true]);
                }
            }
        });

        return $this->listForProduct((int) $product->id);
    }

    public function updateUsageType(Product $product, int $imageId, string $usageType): array
    {
        if (! self::hasExtendedProductImageColumns()) {
            throw ValidationException::withMessages([
                'usage_type' => ['В базе нет поля usage_type для product_images. Примените миграции.'],
            ]);
        }

        $usageType = $usageType === ProductImage::USAGE_CATALOG ? ProductImage::USAGE_CATALOG : ProductImage::USAGE_GALLERY;

        $image = ProductImage::query()
            ->where('product_id', $product->id)
            ->where('id', $imageId)
            ->firstOrFail();

        if ($usageType === ProductImage::USAGE_CATALOG) {
            $otherCatalog = (int) ProductImage::query()
                ->where('product_id', $product->id)
                ->where('usage_type', ProductImage::USAGE_CATALOG)
                ->where('id', '!=', $image->id)
                ->count();
            if ($otherCatalog >= 2) {
                throw ValidationException::withMessages([
                    'usage_type' => ['Каталожных изображений может быть не более двух.'],
                ]);
            }
        }

        DB::transaction(function () use ($image, $usageType): void {
            $image->update(['usage_type' => $usageType]);
        });

        return $this->listForProduct((int) $product->id);
    }

    public function setWatermarkDecision(Product $product, int $imageId, string $decision): array
    {
        if (! Schema::hasColumn('product_images', 'watermark_status')) {
            throw ValidationException::withMessages([
                'decision' => ['В базе нет полей watermark для product_images. Примените миграции.'],
            ]);
        }

        $image = ProductImage::query()
            ->where('product_id', $product->id)
            ->where('id', $imageId)
            ->firstOrFail();

        $status = $decision === 'accept'
            ? ProductImage::WATERMARK_CROPPED
            : ProductImage::WATERMARK_NONE;

        $meta = is_array($image->watermark_meta) ? $image->watermark_meta : [];
        $meta['manual_decision'] = $decision;
        $meta['manual_decision_at'] = now()->toIso8601String();

        $image->update([
            'watermark_status' => $status,
            'watermark_meta' => $meta,
        ]);

        return $this->listForProduct((int) $product->id);
    }

    /**
     * @param int[] $imageIds
     */
    public function reorder(Product $product, array $imageIds): array
    {
        $normalizedIds = array_values(array_unique(array_map('intval', $imageIds)));
        $productImageIds = ProductImage::query()
            ->where('product_id', $product->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($value) => (int) $value)
            ->values()
            ->all();

        sort($normalizedIds);
        $sortedProductImageIds = $productImageIds;
        sort($sortedProductImageIds);

        if ($normalizedIds !== $sortedProductImageIds) {
            throw ValidationException::withMessages([
                'image_ids' => ['Передан некорректный список изображений'],
            ]);
        }

        DB::transaction(function () use ($product, $imageIds): void {
            foreach (array_values($imageIds) as $sortOrder => $imageId) {
                ProductImage::query()
                    ->where('product_id', $product->id)
                    ->where('id', (int) $imageId)
                    ->update(['sort_order' => $sortOrder]);
            }

            $this->syncAltBySortOrder($product);
        });

        return $this->listForProduct((int) $product->id);
    }

    public function setMain(Product $product, int $imageId): array
    {
        $image = ProductImage::query()
            ->where('product_id', $product->id)
            ->where('id', $imageId)
            ->firstOrFail();

        DB::transaction(function () use ($product, $image): void {
            ProductImage::query()
                ->where('product_id', $product->id)
                ->update(['is_main' => false]);

            $image->update(['is_main' => true]);
        });

        return $this->listForProduct((int) $product->id);
    }

    public function delete(Product $product, int $imageId): array
    {
        $image = ProductImage::query()
            ->where('product_id', $product->id)
            ->where('id', $imageId)
            ->firstOrFail();

        DB::transaction(function () use ($product, $image): void {
            $storagePath = ltrim((string) preg_replace('#^storage/#', '', (string) $image->path), '/');
            if ($storagePath !== '') {
                Storage::disk('public')->delete($storagePath);
            }

            $image->delete();

            $remaining = ProductImage::query()
                ->where('product_id', $product->id)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();

            foreach ($remaining as $index => $item) {
                $item->update([
                    'sort_order' => $index,
                    'alt' => $this->buildAltText((string) $product->name, $index + 1),
                ]);
            }

            $hasMainImage = $remaining->contains(fn (ProductImage $item) => (bool) $item->is_main);
            if (!$hasMainImage && $remaining->isNotEmpty()) {
                $remaining->first()->update(['is_main' => true]);
            }
        });

        return $this->listForProduct((int) $product->id);
    }

    public function listForProduct(int $productId): array
    {
        return ProductImage::query()
            ->where('product_id', $productId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(function (ProductImage $image) {
                return [
                    'id' => (int) $image->id,
                    'path' => $image->path,
                    'alt' => $image->alt,
                    'is_main' => (bool) $image->is_main,
                    'sort_order' => (int) $image->sort_order,
                    'usage_type' => self::hasExtendedProductImageColumns()
                        ? (string) ($image->usage_type ?? ProductImage::USAGE_GALLERY)
                        : ProductImage::USAGE_GALLERY,
                    'watermark_status' => Schema::hasColumn('product_images', 'watermark_status')
                        ? (string) ($image->watermark_status ?? ProductImage::WATERMARK_NONE)
                        : ProductImage::WATERMARK_NONE,
                ];
            })
            ->values()
            ->all();
    }

    private function syncAltBySortOrder(Product $product): void
    {
        $images = ProductImage::query()
            ->where('product_id', $product->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        foreach ($images as $index => $image) {
            $image->update([
                'alt' => $this->buildAltText((string) $product->name, $index + 1),
            ]);
        }
    }

    private function buildAltText(string $productName, int $number): string
    {
        $name = trim($productName);
        if ($name === '') {
            $name = 'Товар';
        }

        return sprintf('%s — фото %d', $name, max(1, $number));
    }

    private function buildSeoFilename(
        FilesystemAdapter $disk,
        string $directory,
        string $baseSlug,
        int $startNumber,
        string $extension
    ): string
    {
        $currentNumber = max(1, $startNumber);

        while (true) {
            $candidate = sprintf('%s-%d.%s', $baseSlug, $currentNumber, $extension);
            $path = $directory . '/' . $candidate;
            if (!$disk->exists($path)) {
                return $candidate;
            }
            $currentNumber++;
        }
    }
}
