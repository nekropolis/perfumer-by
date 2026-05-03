<?php

use Illuminate\Support\Facades\Route;
use Modules\Reviews\Http\Controllers\Admin\ReviewAdminController;
use Modules\Reviews\Http\Controllers\Api\ReviewController;

Route::prefix('reviews')->group(function () {
    Route::get('/stats', [ReviewController::class, 'stats'])->middleware('throttle:reviews-read');
    Route::get('/', [ReviewController::class, 'index'])->middleware('throttle:reviews-read');
    Route::post('/', [ReviewController::class, 'store'])->middleware('throttle:reviews-submit');
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/reviews')->group(function () {
    Route::get('/stats', [ReviewAdminController::class, 'stats']);
    Route::get('/', [ReviewAdminController::class, 'index']);
    Route::get('/{id}', [ReviewAdminController::class, 'show'])->whereNumber('id');
    Route::patch('/{id}/status', [ReviewAdminController::class, 'updateStatus'])->whereNumber('id');
    Route::patch('/{id}/reply', [ReviewAdminController::class, 'updateReply'])->whereNumber('id');
});
