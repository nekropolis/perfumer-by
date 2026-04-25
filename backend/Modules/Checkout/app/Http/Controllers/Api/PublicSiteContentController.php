<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Checkout\Services\ShopSettingService;

/**
 * Публичные «точечные» данные для витрины (шапка, подвал и т.д.).
 * Расширяйте ответ по мере появления новых полей (телефоны, тексты и т.п.).
 */
class PublicSiteContentController extends Controller
{
    public function show(ShopSettingService $settings): JsonResponse
    {
        return response()->json([
            'data' => $settings->publicCheckoutSettings(),
        ]);
    }
}
