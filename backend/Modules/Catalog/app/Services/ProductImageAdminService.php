<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductImage;

class ProductImageAdminService
{
    /**
     * @param UploadedFile[] $files
     */
    public function upload(Product $product, array $files): array
    {
        DB::transaction(function () use ($product, $files): void {
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

                ProductImage::query()->create([
                    'product_id' => $product->id,
                    'path' => 'storage/' . ltrim($storedPath, '/'),
                    'alt' => $this->buildAltText((string) $product->name, $nextNumber - 1),
                    'sort_order' => $currentMaxSortOrder + $index + 1,
                    'is_main' => false,
                ]);
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
