<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\Api\CheckoutController;
use Modules\Checkout\Http\Controllers\Api\OrderController;
use Modules\Checkout\Http\Controllers\Api\MyOrdersController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationAdminController;
use Modules\Checkout\Http\Controllers\Api\CallbackRequestController;

Route::prefix('checkout')->group(function () {
    Route::post('/', [CheckoutController::class, 'checkout']);
});

// Публичные формы «сообщить о поступлении» и «заказать звонок» — с жёстким
// троттлингом, чтобы не превращать формы в канал массовой рассылки/спама.
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/stock-notifications', [StockNotificationController::class, 'store']);
    Route::post('/callback-requests', [CallbackRequestController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/orders')->group(function () {
    Route::get('/', [OrderController::class, 'index']);
    Route::get('/stats', [OrderController::class, 'stats']);
    Route::post('/{id}/sync-inventory-writeoff', [OrderController::class, 'syncInventoryWriteoff']);
    Route::get('/{id}', [OrderController::class, 'show']);
    Route::patch('/{id}/status', [OrderController::class, 'updateStatus']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/stock-notifications')->group(function () {
    Route::get('/stats', [StockNotificationAdminController::class, 'stats']);
    Route::get('/', [StockNotificationAdminController::class, 'index']);
    Route::patch('/{id}/status', [StockNotificationAdminController::class, 'updateStatus']);
});

Route::middleware('auth:sanctum')->prefix('orders')->group(function () {
    Route::get('/my', [MyOrdersController::class, 'index']);
    Route::get('/my/{id}', [MyOrdersController::class, 'show']);
});
