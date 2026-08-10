<?php

namespace Modules\Settings\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Settings\Services\ShopSettingService;

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
                'contact_phone_mts' => (string) $settings->get('contact_phone_mts', '+375336408833'),
                'contact_phone_a1' => (string) $settings->get('contact_phone_a1', '+375296408833'),
                'contact_phone_life' => (string) $settings->get('contact_phone_life', '+375256408833'),
                'contact_email' => (string) $settings->get('contact_email', 'admin@perfumer.by'),
                'contact_telegram_url' => (string) $settings->get('contact_telegram_url', 'https://t.me/perfumer_support'),
                'contact_viber_url' => (string) $settings->get('contact_viber_url', 'viber://chat?number=%2B375296408833'),
                'waiting_discount_delivery_date' => (string) $settings->get('waiting_discount_delivery_date', '10.07.2026'),
                'home_popular_brands' => $settings->homePopularBrands(),
                'search_popular_brands' => $settings->searchPopularBrands(),
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
            'contact_phone_mts' => ['nullable', 'string', 'max:64'],
            'contact_phone_a1' => ['nullable', 'string', 'max:64'],
            'contact_phone_life' => ['nullable', 'string', 'max:64'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_telegram_url' => ['nullable', 'string', 'max:512'],
            'contact_viber_url' => ['nullable', 'string', 'max:512'],
            'waiting_discount_delivery_date' => ['nullable', 'string', 'max:64'],
            'home_popular_brand_ids' => ['sometimes', 'array', 'max:'.ShopSettingService::HOME_POPULAR_BRANDS_MAX],
            'home_popular_brand_ids.*' => ['integer', 'distinct', 'exists:brands,id'],
            'search_popular_brand_ids' => ['sometimes', 'array', 'max:'.ShopSettingService::SEARCH_POPULAR_BRANDS_MAX],
            'search_popular_brand_ids.*' => ['integer', 'distinct', 'exists:brands,id'],
        ]);

        $map = [];
        foreach ([
            'delivery_minsk_free_threshold',
            'delivery_minsk_fee',
            'delivery_belarus_fee',
            'delivery_belarus_free_min_lines',
            'contact_phone_mts',
            'contact_phone_a1',
            'contact_phone_life',
            'contact_email',
            'contact_telegram_url',
            'contact_viber_url',
            'waiting_discount_delivery_date',
        ] as $key) {
            if (! array_key_exists($key, $validated) || $validated[$key] === null) {
                continue;
            }
            if (is_string($validated[$key]) && $validated[$key] === '') {
                continue;
            }
            $map[$key] = $validated[$key];
        }

        if (array_key_exists('home_popular_brand_ids', $validated)) {
            $ids = array_values(array_map('intval', $validated['home_popular_brand_ids']));
            $map[ShopSettingService::HOME_POPULAR_BRAND_IDS_KEY] = json_encode($ids);
        }

        if (array_key_exists('search_popular_brand_ids', $validated)) {
            $ids = array_values(array_map('intval', $validated['search_popular_brand_ids']));
            $map[ShopSettingService::SEARCH_POPULAR_BRAND_IDS_KEY] = json_encode($ids);
        }

        if ($map !== []) {
            $settings->setMany($map);
        }

        return $this->show($settings);
    }
}
