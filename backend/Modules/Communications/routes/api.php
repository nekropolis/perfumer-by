<?php

use Illuminate\Support\Facades\Route;
use Modules\Communications\Http\Controllers\Admin\IncomingCallDeviceController;
use Modules\Communications\Http\Controllers\Api\SendToCrmController;
use Modules\Communications\Http\Middleware\AuthenticateIncomingCallDevice;

Route::middleware(['auth:sanctum', AuthenticateIncomingCallDevice::class])
    ->post('/incoming-calls/send-to-crm', SendToCrmController::class);

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/incoming-call-devices')->group(function () {
    Route::get('/managers', [IncomingCallDeviceController::class, 'managers']);
    Route::get('/', [IncomingCallDeviceController::class, 'index']);
    Route::post('/', [IncomingCallDeviceController::class, 'store']);
    Route::post('/{id}/regenerate-token', [IncomingCallDeviceController::class, 'regenerateToken']);
    Route::patch('/{id}', [IncomingCallDeviceController::class, 'update']);
    Route::delete('/{id}', [IncomingCallDeviceController::class, 'destroy']);
});
