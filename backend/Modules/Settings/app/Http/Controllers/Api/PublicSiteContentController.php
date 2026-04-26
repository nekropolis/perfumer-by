<?php

namespace Modules\Settings\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Settings\Services\ShopSettingService;

/**
 * Публичные «точечные» данные для витрины (шапка, подвал и т.д.).
 */
class PublicSiteContentController extends Controller
{
    public function show(ShopSettingService $settings): JsonResponse
    {
        return response()->json([
            'data' => $settings->publicSiteContent(),
        ]);
    }
}
