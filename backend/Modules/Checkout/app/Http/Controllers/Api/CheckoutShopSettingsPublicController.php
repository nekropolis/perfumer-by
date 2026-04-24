<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Checkout\Services\ShopSettingService;

class CheckoutShopSettingsPublicController extends Controller
{
    public function show(ShopSettingService $settings): JsonResponse
    {
        return response()->json([
            'data' => [
                'delivery_minsk_free_threshold' => $settings->getDecimal('delivery_minsk_free_threshold', 50),
                'delivery_minsk_fee' => $settings->getDecimal('delivery_minsk_fee', 3),
                'delivery_belarus_fee' => $settings->getDecimal('delivery_belarus_fee', 6),
                'delivery_belarus_free_min_lines' => $settings->getInt('delivery_belarus_free_min_lines', 2),
            ],
        ]);
    }
}
