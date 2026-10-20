<?php

use Illuminate\Support\Facades\Route;
use Modules\BatchCode\Http\Controllers\Admin\BatchCodeSubmissionAdminController;
use Modules\BatchCode\Http\Controllers\Api\BatchCodeController;
use Modules\BatchCode\Http\Controllers\Api\BatchCodeSubmissionController;

Route::middleware('throttle:30,1')->group(function () {
    Route::get('/batch-code/brands', [BatchCodeController::class, 'brands']);
    Route::post('/batch-code/check', [BatchCodeController::class, 'check']);
    Route::post('/batch-code/submissions', [BatchCodeSubmissionController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/batch-code/submissions')->group(function () {
    Route::get('/', [BatchCodeSubmissionAdminController::class, 'index']);
    Route::patch('/{id}', [BatchCodeSubmissionAdminController::class, 'update'])->whereNumber('id');
});
