<?php

use Illuminate\Support\Facades\Route;
use Modules\Users\Http\Controllers\Api\AuthController;

Route::prefix('auth')->group(function () {
    Route::post('/request-code', [AuthController::class, 'requestCode']);
    Route::post('/verify-code', [AuthController::class, 'verifyCode']);
    Route::middleware('auth:sanctum')->get('/me', [AuthController::class, 'me']);
});
