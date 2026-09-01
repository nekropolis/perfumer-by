<?php

use Illuminate\Support\Facades\Route;
use Modules\ImportExport\Http\Controllers\Admin\AllparfumeAdminController;
use Modules\ImportExport\Http\Controllers\Admin\LegacyUnmatchedProductAdminController;
use Modules\ImportExport\Http\Controllers\Admin\SeoRedirectAdminController;
use Modules\ImportExport\Http\Controllers\Api\AllparfumeCatalogFeedController;
use Modules\ImportExport\Http\Controllers\Api\SeoRedirectController;

Route::post('seo-redirects/resolve', [SeoRedirectController::class, 'resolve']);

Route::middleware('throttle:60,1')->get('feeds/allparfume.json', [AllparfumeCatalogFeedController::class, 'show']);
Route::middleware('throttle:10,1')->post('feeds/allparfume.json', [AllparfumeCatalogFeedController::class, 'importIds']);

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/seo-redirects')->group(function () {
    Route::get('/', [SeoRedirectAdminController::class, 'index']);
    Route::post('/', [SeoRedirectAdminController::class, 'store']);
    Route::put('/{id}', [SeoRedirectAdminController::class, 'update']);
    Route::delete('/{id}', [SeoRedirectAdminController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/legacy-products')->group(function () {
    Route::get('/', [LegacyUnmatchedProductAdminController::class, 'index']);
    Route::get('/{id}', [LegacyUnmatchedProductAdminController::class, 'show']);
    Route::get('/{id}/target-search', [LegacyUnmatchedProductAdminController::class, 'targetSearch']);
    Route::post('/{id}/link', [LegacyUnmatchedProductAdminController::class, 'link']);
    Route::post('/{id}/skip', [LegacyUnmatchedProductAdminController::class, 'skip']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/import-export/allparfume')->group(function () {
    Route::get('/brands', [AllparfumeAdminController::class, 'brands']);
    Route::get('/last-crawled-at', [AllparfumeAdminController::class, 'lastCrawledAt']);
    Route::get('/variants', [AllparfumeAdminController::class, 'variants']);
    Route::get('/shops', [AllparfumeAdminController::class, 'shops']);
    Route::patch('/shops/{id}', [AllparfumeAdminController::class, 'updateShop'])->whereNumber('id');
    Route::post('/refresh-prices', [AllparfumeAdminController::class, 'startRefresh']);
    Route::post('/sync-all', [AllparfumeAdminController::class, 'startFullSync']);
    Route::get('/sync/active', [AllparfumeAdminController::class, 'syncActive']);
    Route::get('/sync/{jobId}', [AllparfumeAdminController::class, 'syncStatus']);
    Route::post('/auto-match', [AllparfumeAdminController::class, 'autoMatch']);
    Route::post('/import-ids', [AllparfumeAdminController::class, 'importIds']);
    Route::post('/force-link', [AllparfumeAdminController::class, 'forceLink']);
    Route::post('/reset-link', [AllparfumeAdminController::class, 'resetLink']);
});

