<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\Api\CheckoutController;
use Modules\Checkout\Http\Controllers\Api\OrderController;
use Modules\Checkout\Http\Controllers\Api\MyOrdersController;

Route::prefix('checkout')->group(function () {
    Route::post('/', [CheckoutController::class, 'checkout']);
});

Route::prefix('admin/orders')->group(function () {
    Route::get('/', [OrderController::class, 'index']);
    Route::get('/{id}', [OrderController::class, 'show']);
    Route::patch('/{id}/status', [OrderController::class, 'updateStatus']);
});

Route::middleware('auth:sanctum')->prefix('orders')->group(function () {
    Route::get('/my', [MyOrdersController::class, 'index']);
    Route::get('/my/{id}', [MyOrdersController::class, 'show']);
});
