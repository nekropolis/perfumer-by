<?php

use Illuminate\Support\Facades\Route;
use Modules\Loyalty\Http\Controllers\Api\AdminGiftCertificateController;
use Modules\Loyalty\Http\Controllers\Api\AdminLoyaltyCardController;
use Modules\Loyalty\Http\Controllers\Api\AdminLoyaltyReportController;
use Modules\Loyalty\Http\Controllers\Api\MyLoyaltyCardController;

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/loyalty')->group(function () {
    Route::get('/gift-certificate-templates', [AdminGiftCertificateController::class, 'templates']);
    Route::get('/gift-certificates', [AdminGiftCertificateController::class, 'index']);
    Route::post('/gift-certificates', [AdminGiftCertificateController::class, 'store']);
    Route::get('/gift-certificates/{id}', [AdminGiftCertificateController::class, 'show']);
    Route::patch('/gift-certificates/{id}', [AdminGiftCertificateController::class, 'update']);

    Route::get('/cards', [AdminLoyaltyCardController::class, 'index']);
    Route::post('/cards', [AdminLoyaltyCardController::class, 'store']);
    Route::get('/cards/{id}', [AdminLoyaltyCardController::class, 'show']);
    Route::patch('/cards/{id}', [AdminLoyaltyCardController::class, 'update']);
    Route::post('/cards/{id}/attach-user', [AdminLoyaltyCardController::class, 'attachUser']);
    Route::delete('/cards/{id}/users/{userId}', [AdminLoyaltyCardController::class, 'detachUser']);

    Route::get('/reports/cards', [AdminLoyaltyReportController::class, 'cards']);
});

Route::middleware(['auth:sanctum', 'ensure_client'])->prefix('loyalty')->group(function () {
    Route::get('/cards/my', [MyLoyaltyCardController::class, 'index']);
    Route::post('/cards/attach', [MyLoyaltyCardController::class, 'attachByNumber']);
});

