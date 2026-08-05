<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\Api\AdminDeliveryCitiesController;
use Modules\Checkout\Http\Controllers\Api\CheckoutCitiesController;
use Modules\Checkout\Http\Controllers\Api\CheckoutController;
use Modules\Checkout\Http\Controllers\Api\CheckoutQuoteController;
use Modules\Checkout\Http\Controllers\Api\OrderController;
use Modules\Checkout\Http\Controllers\Api\VeterTicketSendController;
use Modules\Checkout\Http\Controllers\Api\VeterTicketStatusSyncController;
use Modules\ImportExport\Http\Controllers\Admin\LegacySyncController;
use Modules\Checkout\Http\Controllers\Api\OrderTagController;
use Modules\Checkout\Http\Controllers\Api\OrderStatusController;
use Modules\Checkout\Http\Controllers\Api\SupplierOrderController;
use Modules\Checkout\Http\Controllers\Api\MyOrdersController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationController;
use Modules\Checkout\Http\Controllers\Api\StockNotificationAdminController;
use Modules\Checkout\Http\Controllers\Api\CallbackRequestController;
use Modules\Checkout\Http\Controllers\Api\AdminDashboardController;
use Modules\Communications\Http\Controllers\Admin\TelegramTestController;

Route::prefix('checkout')->group(function () {
    Route::middleware('throttle:30,1')->group(function () {
        Route::post('/quote', [CheckoutQuoteController::class, 'quote']);
        Route::get('/cities', [CheckoutCitiesController::class, 'search']);
    });
    Route::post('/', [CheckoutController::class, 'checkout']);
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
    Route::post('/quote', [OrderController::class, 'quote']);
    Route::post('/veter-send', VeterTicketSendController::class);
    Route::post('/veter-status-sync', VeterTicketStatusSyncController::class);
    Route::post('/legacy-sync', LegacySyncController::class);
    Route::post('/', [OrderController::class, 'store']);
    Route::post('/{id}/sync-inventory-writeoff', [OrderController::class, 'syncInventoryWriteoff']);
    Route::get('/{id}', [OrderController::class, 'show']);
    Route::put('/{id}', [OrderController::class, 'update']);
    Route::patch('/{id}/admin-fields', [OrderController::class, 'updateAdminFields']);
    Route::delete('/{id}', [OrderController::class, 'destroy']);
    Route::patch('/{id}/status', [OrderController::class, 'updateStatus']);
    Route::patch('/{id}/items/{itemId}/fulfillment', [OrderController::class, 'updateItemFulfillment']);
});

Route::middleware(['auth:sanctum', 'is_admin_or_manager'])->prefix('admin/order-tags')->group(function () {
    Route::get('/', [OrderTagController::class, 'index']);
    Route::post('/', [OrderTagController::class, 'store']);
    Route::put('/{id}', [OrderTagController::class, 'update']);
    Route::delete('/{id}', [OrderTagController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin_or_manager'])->prefix('admin/order-statuses')->group(function () {
    Route::get('/', [OrderStatusController::class, 'index']);
    Route::post('/', [OrderStatusController::class, 'store']);
    Route::put('/{id}', [OrderStatusController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'is_admin_or_manager'])->prefix('admin/supplier-orders')->group(function () {
    Route::post('/draft-from-reservations', [SupplierOrderController::class, 'draftFromReservations']);
    Route::get('/draft', [SupplierOrderController::class, 'draft']);
    Route::post('/draft/items', [SupplierOrderController::class, 'storeDraftItem']);
    Route::patch('/items/{id}', [SupplierOrderController::class, 'updateItem']);
    Route::delete('/items/{id}', [SupplierOrderController::class, 'destroyItem']);
    Route::post('/confirm', [SupplierOrderController::class, 'confirm']);
    Route::get('/', [SupplierOrderController::class, 'index']);
    Route::get('/{id}/export-xlsx', [SupplierOrderController::class, 'exportXlsx']);
    Route::get('/{id}', [SupplierOrderController::class, 'show']);
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

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/system/delivery-cities')->group(function () {
    Route::get('/', [AdminDeliveryCitiesController::class, 'index']);
    Route::post('/sync', [AdminDeliveryCitiesController::class, 'sync']);
});

Route::middleware(['auth:sanctum', 'ensure_client'])->prefix('orders')->group(function () {
    Route::get('/my', [MyOrdersController::class, 'index']);
    Route::get('/my/{id}', [MyOrdersController::class, 'show']);
});
