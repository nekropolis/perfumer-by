<?php

use Illuminate\Support\Facades\Route;
use Modules\Catalog\Http\Controllers\Api\ProductController;

Route::prefix('catalog')->group(function () {
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{slug}', [ProductController::class, 'show']);
});
