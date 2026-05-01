<?php

use Illuminate\Support\Facades\Route;
use Modules\ImportExport\Http\Controllers\Admin\LegacyUnmatchedProductAdminController;
use Modules\ImportExport\Http\Controllers\Admin\SeoRedirectAdminController;

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

