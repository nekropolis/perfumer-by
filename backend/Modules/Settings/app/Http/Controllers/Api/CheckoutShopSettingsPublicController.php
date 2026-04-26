<?php

namespace Modules\Settings\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Settings\Services\ShopSettingService;

/** Публичные настройки доставки для шага checkout (без контактов). */
class CheckoutShopSettingsPublicController extends Controller
{
    public function show(ShopSettingService $settings): JsonResponse
    {
        return response()->json([
            'data' => $settings->publicCheckoutSettings(),
        ]);
    }
}
