<?php

use Illuminate\Support\Facades\Route;
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
