<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\Admin\ShopSettingAdminController;
use Modules\Checkout\Http\Controllers\Api\CheckoutCitiesController;
use Modules\Checkout\Http\Controllers\Api\CheckoutController;
use Modules\Checkout\Http\Controllers\Api\CheckoutQuoteController;
use Modules\Checkout\Http\Controllers\Api\CheckoutShopSettingsPublicController;
use Modules\Checkout\Http\Controllers\Api\OrderController;
use Modules\Checkout\Http\Controllers\Api\MyOrdersController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationAdminController;
use Modules\Checkout\Http\Controllers\Api\CallbackRequestController;
use Modules\Checkout\Http\Controllers\Api\AdminDashboardController;
use Modules\Communications\Http\Controllers\Admin\TelegramTestController;

Route::prefix('checkout')->group(function () {
    Route::middleware('throttle:60,1')->get('/shop-settings', [CheckoutShopSettingsPublicController::class, 'show']);
    Route::middleware('throttle:30,1')->group(function () {
        Route::post('/quote', [CheckoutQuoteController::class, 'quote']);
        Route::get('/cities', [CheckoutCitiesController::class, 'search']);
    });
    Route::post('/', [CheckoutController::class, 'checkout']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/shop-settings')->group(function () {
    Route::get('/', [ShopSettingAdminController::class, 'show']);
    Route::patch('/', [ShopSettingAdminController::class, 'update']);
});

// Публичные формы «сообщить о поступлении» и «заказать звонок» — с жёстким
// троттлингом, чтобы не превращать формы в канал массовой рассылки/спама.
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/stock-notifications', [StockNotificationController::class, 'store']);
    Route::post('/callback-requests', [CallbackRequestController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'is_admin_or_manager'])->prefix('admin/orders')->group(function () {
    Route::get('/', [OrderController::class, 'index']);
    Route::get('/customer-context', [OrderController::class, 'customerContext']);
    Route::get('/stats', [OrderController::class, 'stats']);
    Route::post('/', [OrderController::class, 'store']);
    Route::post('/{id}/sync-inventory-writeoff', [OrderController::class, 'syncInventoryWriteoff']);
    Route::get('/{id}', [OrderController::class, 'show']);
    Route::put('/{id}', [OrderController::class, 'update']);
    Route::delete('/{id}', [OrderController::class, 'destroy']);
    Route::patch('/{id}/status', [OrderController::class, 'updateStatus']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/dashboard')->group(function () {
    Route::get('/stats', [AdminDashboardController::class, 'stats']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/communications')->group(function () {
    Route::post('/test-telegram', [TelegramTestController::class, 'send']);
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
