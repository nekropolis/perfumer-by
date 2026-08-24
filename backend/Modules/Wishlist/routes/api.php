<?php

use Illuminate\Support\Facades\Route;
use Modules\Wishlist\Http\Controllers\Api\WishlistController;

Route::post('/wishlist/preview', [WishlistController::class, 'preview']);
Route::post('/wishlist/track', [WishlistController::class, 'track'])
    ->middleware('throttle:60,1');

Route::middleware(['auth:sanctum', 'ensure_client'])->prefix('wishlist')->group(function () {
    Route::get('/', [WishlistController::class, 'index']);
    Route::post('/items', [WishlistController::class, 'store']);
    Route::delete('/items/{productId}', [WishlistController::class, 'destroy']);
    Route::put('/sync', [WishlistController::class, 'sync']);
});
