<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\Api\CheckoutController;

Route::prefix('checkout')->group(function () {
    Route::post('/', [CheckoutController::class, 'checkout']);
});
