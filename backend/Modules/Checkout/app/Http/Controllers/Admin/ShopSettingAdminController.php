<?php

namespace Modules\Checkout\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Services\ShopSettingService;

class ShopSettingAdminController extends Controller
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

    public function update(Request $request, ShopSettingService $settings): JsonResponse
    {
        $validated = $request->validate([
            'delivery_minsk_free_threshold' => ['nullable', 'numeric', 'min:0'],
            'delivery_minsk_fee' => ['nullable', 'numeric', 'min:0'],
            'delivery_belarus_fee' => ['nullable', 'numeric', 'min:0'],
            'delivery_belarus_free_min_lines' => ['nullable', 'integer', 'min:1'],
        ]);

        $map = [];
        foreach ([
            'delivery_minsk_free_threshold',
            'delivery_minsk_fee',
            'delivery_belarus_fee',
            'delivery_belarus_free_min_lines',
        ] as $key) {
            if (array_key_exists($key, $validated) && $validated[$key] !== null) {
                $map[$key] = $validated[$key];
            }
        }

        if ($map !== []) {
            $settings->setMany($map);
        }

        return $this->show($settings);
    }
}
