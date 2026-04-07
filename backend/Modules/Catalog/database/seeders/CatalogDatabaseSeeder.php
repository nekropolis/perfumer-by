<?php

namespace Modules\Catalog\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;


class CatalogDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        ProductImage::query()->delete();
        ProductVariant::query()->delete();
        Product::query()->delete();
        Brand::query()->delete();
        Category::query()->delete();

        $brand1 = Brand::create([
            'name' => 'House Of Sillage',
            'slug' => 'house-of-sillage',
            'seo_title' => 'House Of Sillage',
            'seo_description' => 'Парфюмерия House Of Sillage',
            'is_active' => true,
        ]);

        $brand2 = Brand::create([
            'name' => 'Lancôme',
            'slug' => 'lancome',
            'seo_title' => 'Lancôme',
            'seo_description' => 'Парфюмерия Lancôme',
            'is_active' => true,
        ]);

        $category = Category::create([
            'name' => 'Парфюмерия',
            'slug' => 'parfyumeriya',
            'seo_title' => 'Парфюмерия',
            'seo_description' => 'Каталог парфюмерии',
            'description' => 'Основная категория каталога',
            'sort_order' => 1,
            'is_active' => true,
        ]);

        $product1 = Product::create([
            'brand_id' => $brand1->id,
            'main_category_id' => $category->id,
            'name' => 'House Of Sillage Cherry Garden',
            'slug' => 'house-of-sillage-cherry-garden',
            'h1' => 'House Of Sillage Cherry Garden оригинал',
            'short_description' => 'Нишевая парфюмерия House Of Sillage',
            'description' => 'Тестовое описание товара House Of Sillage Cherry Garden.',
            'seo_title' => 'House Of Sillage Cherry Garden',
            'seo_description' => 'Купить House Of Sillage Cherry Garden',
            'is_active' => true,
            'is_new' => true,
            'is_hit' => true,
            'sort_order' => 1,
        ]);

        $product1->categories()->sync([$category->id]);

        ProductVariant::create([
            'product_id' => $product1->id,
            'sku' => 'HOS-CHG-75-PARF',
            'barcode' => null,
            'title' => '75ml parfum',
            'volume' => 75,
            'volume_unit' => 'ml',
            'concentration' => 'parfum',
            'edition' => null,
            'price' => 793.00,
            'old_price' => 850.00,
            'purchase_price' => 500.00,
            'stock' => 5,
            'is_preorder' => false,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        ProductVariant::create([
            'product_id' => $product1->id,
            'sku' => 'HOS-CHG-75-LIM',
            'barcode' => null,
            'title' => '75ml parfum Limited Edition',
            'volume' => 75,
            'volume_unit' => 'ml',
            'concentration' => 'parfum',
            'edition' => 'Limited Edition',
            'price' => 1805.00,
            'old_price' => 1950.00,
            'purchase_price' => 1200.00,
            'stock' => 2,
            'is_preorder' => false,
            'is_active' => true,
            'sort_order' => 2,
        ]);

        ProductImage::create([
            'product_id' => $product1->id,
            'path' => 'products/house-of-sillage-cherry-garden/main.jpg',
            'alt' => 'House Of Sillage Cherry Garden',
            'sort_order' => 1,
            'is_main' => true,
        ]);

        ProductImage::create([
            'product_id' => $product1->id,
            'path' => 'products/house-of-sillage-cherry-garden/2.jpg',
            'alt' => 'House Of Sillage Cherry Garden bottle',
            'sort_order' => 2,
            'is_main' => false,
        ]);

        $product2 = Product::create([
            'brand_id' => $brand2->id,
            'main_category_id' => $category->id,
            'name' => 'Lancôme Trésor',
            'slug' => 'lancome-tresor',
            'h1' => 'Lancôme Trésor оригинал',
            'short_description' => 'Классический аромат Lancôme',
            'description' => 'Тестовое описание товара Lancôme Trésor.',
            'seo_title' => 'Lancôme Trésor',
            'seo_description' => 'Купить Lancôme Trésor',
            'is_active' => true,
            'is_new' => false,
            'is_hit' => true,
            'sort_order' => 2,
        ]);

        $product2->categories()->sync([$category->id]);

        ProductVariant::create([
            'product_id' => $product2->id,
            'sku' => 'LAN-TRES-30-EDP',
            'barcode' => null,
            'title' => '30ml edp',
            'volume' => 30,
            'volume_unit' => 'ml',
            'concentration' => 'edp',
            'edition' => null,
            'price' => 210.00,
            'old_price' => 250.00,
            'purchase_price' => 120.00,
            'stock' => 7,
            'is_preorder' => false,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        ProductVariant::create([
            'product_id' => $product2->id,
            'sku' => 'LAN-TRES-50-EDP',
            'barcode' => null,
            'title' => '50ml edp',
            'volume' => 50,
            'volume_unit' => 'ml',
            'concentration' => 'edp',
            'edition' => null,
            'price' => 320.00,
            'old_price' => 370.00,
            'purchase_price' => 180.00,
            'stock' => 4,
            'is_preorder' => false,
            'is_active' => true,
            'sort_order' => 2,
        ]);

        ProductImage::create([
            'product_id' => $product2->id,
            'path' => 'products/lancome-tresor/main.jpg',
            'alt' => 'Lancôme Trésor',
            'sort_order' => 1,
            'is_main' => true,
        ]);
    }
}
