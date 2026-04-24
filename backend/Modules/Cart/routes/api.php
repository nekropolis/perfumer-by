<?php

use Illuminate\Support\Facades\Route;
use Modules\Cart\Http\Controllers\Api\CartController;

Route::prefix('cart')->group(function () {
    Route::get('/gift-certificate-templates', [CartController::class, 'templates']);
    Route::get('/', [CartController::class, 'show']);
    Route::post('/items', [CartController::class, 'addItem']);
    Route::patch('/items/{id}', [CartController::class, 'updateItem']);
    Route::delete('/items/{id}', [CartController::class, 'deleteItem']);
    Route::post('/gift-certificate-items', [CartController::class, 'addGiftCertificateItem']);
    Route::patch('/gift-certificate-items/{id}', [CartController::class, 'updateGiftCertificateItem']);
    Route::delete('/gift-certificate-items/{id}', [CartController::class, 'deleteGiftCertificateItem']);
    Route::post('/gift-certificate/apply', [CartController::class, 'applyGiftCertificate']);
    Route::delete('/gift-certificate', [CartController::class, 'clearGiftCertificate']);
    Route::post('/discount-card/apply', [CartController::class, 'applyDiscountCard']);
    Route::delete('/discount-card', [CartController::class, 'clearDiscountCard']);
});
