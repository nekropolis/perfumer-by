<?php

use Illuminate\Support\Facades\Route;
use Modules\Catalog\Http\Controllers\Admin\AttributeController;
use Modules\Catalog\Http\Controllers\Admin\AttributeOptionController;
use Modules\Catalog\Http\Controllers\Admin\BrandController;
use Modules\Catalog\Http\Controllers\Admin\ProductAdminController;
use Modules\Catalog\Http\Controllers\Admin\ProductAttributeAdminController;
use Modules\Catalog\Http\Controllers\Admin\ProductAttributeValueController;
use Modules\Catalog\Http\Controllers\Api\ProductController;
use Modules\Catalog\Http\Controllers\Admin\VanilleImportController;

Route::prefix('catalog')->group(function () {
    Route::get('/brands', [ProductController::class, 'brands']);
    Route::get('/brands/{slug}', [ProductController::class, 'brandBySlug']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{slug}', [ProductController::class, 'show']);

    Route::prefix('admin/import-export/vanille')->group(function () {
        Route::post('/upload', [VanilleImportController::class, 'upload']);
        Route::post('/import', [VanilleImportController::class, 'import']);
        Route::post('/parse-products', [VanilleImportController::class, 'parseProducts']);
        Route::post('/collect-links', [VanilleImportController::class, 'collectLinks']);
        Route::post('/parse-brands', [VanilleImportController::class, 'parseBrands']);
        Route::get('/supplier-products', [VanilleImportController::class, 'supplierProducts']);
        Route::post('/import-parsed-products', [VanilleImportController::class, 'importParsedProducts']);
    });
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/brands')->group(function () {
    Route::get('/', [BrandController::class, 'index']);
    Route::post('/', [BrandController::class, 'store']);
    Route::put('/{id}', [BrandController::class, 'update']);
    Route::delete('/{id}', [BrandController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/products')->group(function () {
    Route::get('/', [ProductAdminController::class, 'index']);
    Route::post('/', [ProductAdminController::class, 'store']);
    Route::get('/{id}', [ProductAdminController::class, 'show']);
    Route::put('/{id}', [ProductAdminController::class, 'update']);
    Route::delete('/{id}', [ProductAdminController::class, 'destroy']);
    Route::get('/brands/options', [ProductAdminController::class, 'brands']);

    Route::post('/{id}/attributes', [ProductAttributeAdminController::class, 'store']);
    Route::put('/{id}/attributes/{attributeId}', [ProductAttributeAdminController::class, 'update']);
    Route::delete('/{id}/attributes/{attributeId}', [ProductAttributeAdminController::class, 'destroy']);

    Route::post('/{id}/attribute-values', [ProductAttributeValueController::class, 'store']);
    Route::put('/{id}/attribute-values/{valueId}', [ProductAttributeValueController::class, 'update']);
    Route::delete('/{id}/attribute-values/{valueId}', [ProductAttributeValueController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/attributes')->group(function () {
    Route::get('/', [AttributeController::class, 'index']);
    Route::get('/binding-options', [AttributeController::class, 'bindingOptions']);
    Route::post('/', [AttributeController::class, 'store']);
    Route::get('/{id}', [AttributeController::class, 'show']);
    Route::put('/{id}', [AttributeController::class, 'update']);
    Route::delete('/{id}', [AttributeController::class, 'destroy']);

    Route::post('/{attributeId}/options', [AttributeOptionController::class, 'store']);
    Route::put('/{attributeId}/options/{optionId}', [AttributeOptionController::class, 'update']);
    Route::delete('/{attributeId}/options/{optionId}', [AttributeOptionController::class, 'destroy']);
});
