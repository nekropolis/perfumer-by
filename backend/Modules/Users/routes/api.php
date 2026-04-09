<?php

use Illuminate\Support\Facades\Route;
use Modules\Users\Http\Controllers\Api\AuthController;
use Modules\Users\Http\Controllers\Api\AdminUserController;

Route::prefix('auth')->group(function () {
    Route::post('/request-code', [AuthController::class, 'requestCode']);
    Route::post('/verify-code', [AuthController::class, 'verifyCode']);
    Route::middleware('auth:sanctum')->get('/me', [AuthController::class, 'me']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/users')->group(function () {
    Route::get('/', [AdminUserController::class, 'index']);
    Route::patch('/{id}/role', [AdminUserController::class, 'updateRole']);
});
