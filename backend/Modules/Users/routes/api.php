<?php

use Illuminate\Support\Facades\Route;
use Modules\Users\Http\Controllers\Api\AuthController;
use Modules\Users\Http\Controllers\Api\AdminClientController;
use Modules\Users\Http\Controllers\Api\AdminUserController;
use Modules\Users\Http\Controllers\Api\AuditLogController;

Route::prefix('auth')->group(function () {
    Route::post('/request-code', [AuthController::class, 'requestCode']);
    Route::post('/verify-code', [AuthController::class, 'verifyCode']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/register/verify', [AuthController::class, 'registerVerify']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::patch('/profile', [AuthController::class, 'updateProfile']);
        Route::post('/password/change-request', [AuthController::class, 'passwordChangeRequest']);
        Route::post('/password/change-verify', [AuthController::class, 'passwordChangeVerify']);
    });
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/users')->group(function () {
    Route::get('/', [AdminUserController::class, 'index']);
    Route::post('/', [AdminUserController::class, 'store']);
    Route::get('/{id}', [AdminUserController::class, 'show']);
    Route::patch('/{id}', [AdminUserController::class, 'update']);
    Route::delete('/{id}', [AdminUserController::class, 'destroy']);
    Route::patch('/{id}/role', [AdminUserController::class, 'updateRole']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/clients')->group(function () {
    Route::get('/', [AdminClientController::class, 'index']);
    Route::post('/', [AdminClientController::class, 'store']);
    Route::get('/{id}', [AdminClientController::class, 'show']);
    Route::get('/{id}/orders-history', [AdminClientController::class, 'ordersHistory']);
    Route::patch('/{id}', [AdminClientController::class, 'update']);
    Route::delete('/{id}', [AdminClientController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/system/audit-log')->group(function () {
    Route::get('/', [AuditLogController::class, 'index']);
});
