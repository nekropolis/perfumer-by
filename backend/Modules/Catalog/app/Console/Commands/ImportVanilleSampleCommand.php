<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;

class ImportVanilleSampleCommand extends Command
{
    protected $signature = 'catalog:import-vanille-sample {path}';
    protected $description = 'Import sample parsed products from vanille.by JSON file';

    public function handle(): int
    {
        $path = $this->argument('path');

        if (!file_exists($path)) {
            $this->error("File not found: {$path}");
            return self::FAILURE;
        }

        $json = file_get_contents($path);
        $items = json_decode($json, true);

        if (!is_array($items)) {
            $this->error('Invalid JSON file');
            return self::FAILURE;
        }

        $supplier = Supplier::firstOrCreate(
            ['code' => 'vanille'],
            [
                'name' => 'Vanille',
                'base_url' => 'https://vanille.by',
                'is_active' => true,
            ]
        );

        foreach ($items as $item) {
            DB::transaction(function () use ($item, $supplier) {
                $brand = null;

                if (!empty($item['brand'])) {
                    $brand = Brand::firstOrCreate(
                        ['slug' => Str::slug($item['brand'])],
                        [
                            'name' => $item['brand'],
                            'seo_title' => $item['brand'],
                            'seo_description' => null,
                            'description' => null,
                            'is_active' => true,
                        ]
                    );
                }

                $product = Product::updateOrCreate(
                    ['slug' => Str::slug($item['name'])],
                    [
                        'brand_id' => $brand?->id,
                        'main_category_id' => null,
                        'name' => $item['name'],
                        'h1' => $item['name'],
                        'short_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 1000),
                        'description' => $item['description'] ?? null,
                        'seo_title' => mb_substr(trim($item['page_title'] ?? $item['name'] ?? ''), 0, 255),
                        'seo_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 500),
                        'is_active' => true,
                        'is_new' => false,
                        'is_hit' => false,
                        'sort_order' => 0,
                    ]
                );

                ProductAttribute::where('product_id', $product->id)->delete();

                $sort = 0;
                foreach (($item['characteristics'] ?? []) as $name => $value) {
                    ProductAttribute::create([
                        'product_id' => $product->id,
                        'name' => $name,
                        'value' => $value,
                        'sort_order' => $sort++,
                    ]);
                }

                foreach (($item['offers'] ?? []) as $index => $offer) {
                    $parsed = $this->parseVariant($offer);

                    $variant = ProductVariant::updateOrCreate(
                        [
                            'product_id' => $product->id,
                            'title' => $offer['title'],
                        ],
                        [
                            'volume' => $parsed['volume'],
                            'volume_unit' => $parsed['volume_unit'],
                            'type' => $offer['type'] ?? null,
                            'concentration' => $parsed['concentration'],
                            'edition' => $parsed['edition'],
                            'price' => $this->normalizePrice($offer['price_byn'] ?? null),
                            'old_price' => $this->normalizePrice($offer['old_price'] ?? null),
                            'stock' => $this->normalizeStock($offer['stock_flag'] ?? null),
                            'is_preorder' => false,
                            'is_active' => true,
                            'sort_order' => $index,
                        ]
                    );

                    SupplierVariantOffer::updateOrCreate(
                        [
                            'supplier_id' => $supplier->id,
                            'product_variant_id' => $variant->id,
                            'external_id' => $offer['article'] ?? null,
                        ],
                        [
                            'external_product_url' => $item['url'] ?? null,
                            'external_product_name' => $item['name'] ?? null,
                            'external_variant_name' => $offer['variant'] ?? null,
                            'sku' => null,
                            'price' => $this->normalizePrice($offer['price_byn'] ?? null),
                            'old_price' => $this->normalizePrice($offer['old_price'] ?? null),
                            'purchase_price' => null,
                            'stock' => $this->normalizeStock($offer['stock_flag'] ?? null),
                            'is_preorder' => false,
                            'is_active' => true,
                            'last_seen_at' => now(),
                            'last_synced_at' => now(),
                            'payload' => $offer,
                        ]
                    );
                }

                $this->refreshVariantAggregates($product);
            });

            $this->info('Imported: ' . ($item['name'] ?? 'unknown'));
        }

        $this->info('Done');
        return self::SUCCESS;
    }

    protected function parseVariant(array $offer): array
    {
        $variant = $offer['variant'] ?? '';
        $title = $offer['title'] ?? '';

        $volume = null;
        $volumeUnit = null;

        if (preg_match('/(\d+)\s*(мл|ml)/iu', $variant, $m)) {
            $volume = (int) $m[1];
            $volumeUnit = 'ml';
        }

        $edition = null;
        if (Str::contains(mb_strtolower($variant), 'тестер') || Str::contains(mb_strtolower($title), 'tester')) {
            $edition = 'tester';
        }

        $concentration = null;
        $titleLower = mb_strtolower($title);

        if (str_contains($titleLower, ' parfum')) {
            $concentration = 'parfum';
        } elseif (str_contains($titleLower, ' edp')) {
            $concentration = 'edp';
        } elseif (str_contains($titleLower, ' edt')) {
            $concentration = 'edt';
        }

        return [
            'volume' => $volume,
            'volume_unit' => $volumeUnit,
            'concentration' => $concentration,
            'edition' => $edition,
        ];
    }

    protected function normalizePrice($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $value = strip_tags((string) $value);
        $value = str_replace(['BYN', ' '], '', $value);
        $value = str_replace(',', '.', $value);

        return is_numeric($value) ? number_format((float) $value, 2, '.', '') : null;
    }

    protected function normalizeStock($value): int
    {
        if ($value === null || $value === '') {
            return 0;
        }

        return (int) $value;
    }

    protected function refreshVariantAggregates(Product $product): void
    {
        $product->load('variants.supplierOffers');

        foreach ($product->variants as $variant) {
            $offers = $variant->supplierOffers
                ->where('is_active', true)
                ->sortBy('price')
                ->values();

            if ($offers->isEmpty()) {
                $variant->update([
                    'price' => null,
                    'old_price' => null,
                    'stock' => 0,
                    'is_active' => false,
                ]);
                continue;
            }

            $bestOffer = $offers->first();

            $variant->update([
                'price' => $bestOffer->price,
                'old_price' => $bestOffer->old_price,
                'stock' => (int) $offers->max('stock'),
                'is_active' => true,
                'is_preorder' => (bool) $offers->every(fn ($offer) => $offer->is_preorder),
            ]);
        }
    }
}
