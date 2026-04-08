<?php

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Http\Controllers\CheckoutController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('checkouts', CheckoutController::class)->names('checkout');
});
