<?php

use Illuminate\Support\Facades\Route;
use Modules\Pages\Http\Controllers\Admin\BlockAdminController;
use Modules\Pages\Http\Controllers\Admin\PageAdminController;
use Modules\Pages\Http\Controllers\Api\BlockController;
use Modules\Pages\Http\Controllers\Api\PageController;

Route::prefix('pages')->group(function () {
    Route::get('/{slug}', [PageController::class, 'showBySlug']);
});

Route::prefix('blocks')->group(function () {
    Route::get('/{code}', [BlockController::class, 'showByCode']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/pages')->group(function () {
    Route::get('/', [PageAdminController::class, 'index']);
    Route::post('/', [PageAdminController::class, 'store']);
    Route::post('/content-images', [PageAdminController::class, 'uploadContentImage']);
    Route::get('/{id}', [PageAdminController::class, 'show']);
    Route::put('/{id}', [PageAdminController::class, 'update']);
    Route::delete('/{id}', [PageAdminController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/blocks')->group(function () {
    Route::get('/', [BlockAdminController::class, 'index']);
    Route::post('/', [BlockAdminController::class, 'store']);
    Route::post('/content-images', [BlockAdminController::class, 'uploadContentImage']);
    Route::get('/{id}', [BlockAdminController::class, 'show']);
    Route::put('/{id}', [BlockAdminController::class, 'update']);
    Route::delete('/{id}', [BlockAdminController::class, 'destroy']);
});
