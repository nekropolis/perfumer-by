<?php

use Illuminate\Support\Facades\Route;
use Modules\Warehouse\Http\Controllers\Admin\StockBalanceController;
use Modules\Warehouse\Http\Controllers\Admin\StockReportController;
use Modules\Warehouse\Http\Controllers\Admin\StockReceiptController;
use Modules\Warehouse\Http\Controllers\Admin\StockWriteoffController;

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/stock')->group(function () {
    Route::get('/suppliers/options', [StockReceiptController::class, 'suppliers']);
    Route::get('/warehouses/options', [StockReceiptController::class, 'warehouses']);
    Route::get('/balances', [StockBalanceController::class, 'index']);

    Route::prefix('receipts')->group(function () {
        Route::get('/', [StockReceiptController::class, 'index']);
        Route::post('/', [StockReceiptController::class, 'store']);
        Route::post('/import-xls/prepare', [StockReceiptController::class, 'importXlsPrepare']);
        Route::post('/import-xls/resolve-batch', [StockReceiptController::class, 'importXlsResolveBatch']);
        Route::post('/import-xls/commit', [StockReceiptController::class, 'importXlsCommit']);
        Route::post('/import-xls/clear-receipt', [StockReceiptController::class, 'importXlsClearReceipt']);
        Route::get('/import-xls/state', [StockReceiptController::class, 'importXlsState']);
        Route::post('/import-xls/state', [StockReceiptController::class, 'importXlsStateSave']);
        Route::post('/import-xls', [StockReceiptController::class, 'importXls']);
        Route::post('/{id}/post', [StockReceiptController::class, 'postReceipt']);
        Route::get('/{id}', [StockReceiptController::class, 'show']);
        Route::put('/{id}', [StockReceiptController::class, 'update']);
        Route::delete('/{id}', [StockReceiptController::class, 'destroy']);
    });

    Route::prefix('writeoffs')->group(function () {
        Route::get('/', [StockWriteoffController::class, 'index']);
        Route::post('/', [StockWriteoffController::class, 'store']);
        Route::get('/{id}', [StockWriteoffController::class, 'show']);
        Route::post('/{id}/reverse', [StockWriteoffController::class, 'reverse']);
    });

    Route::prefix('reports')->group(function () {
        Route::get('/order-reservations', [StockReportController::class, 'orderReservations']);
        Route::get('/receipts', [StockReportController::class, 'receipts']);
        Route::get('/writeoffs', [StockReportController::class, 'writeoffs']);
        Route::get('/sales', [StockReportController::class, 'sales']);
    });
});
