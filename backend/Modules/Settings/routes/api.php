<?php

use Illuminate\Support\Facades\Route;
use Modules\Settings\Http\Controllers\Admin\ShopSettingAdminController;
use Modules\Settings\Http\Controllers\Api\CheckoutShopSettingsPublicController;
use Modules\Settings\Http\Controllers\Api\ContactsPagePublicController;
use Modules\Settings\Http\Controllers\Api\PublicSiteContentController;

Route::middleware('throttle:60,1')->get('/site/content', [PublicSiteContentController::class, 'show']);
Route::middleware('throttle:60,1')->get('/site/contacts', [ContactsPagePublicController::class, 'show']);

Route::prefix('checkout')->group(function () {
    Route::middleware('throttle:60,1')->get('/shop-settings', [CheckoutShopSettingsPublicController::class, 'show']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/shop-settings')->group(function () {
    Route::get('/', [ShopSettingAdminController::class, 'show']);
    Route::patch('/', [ShopSettingAdminController::class, 'update']);
});
