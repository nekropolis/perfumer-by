<?php

namespace Modules\Checkout\Support;

use Modules\Checkout\Models\VeterCity;
use Modules\Checkout\Services\CheckoutDeliveryService;

final class DeliveryCityResolver
{
    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function apply(array $validated): array
    {
        $method = $validated['delivery_method'] ?? null;

        if ($method === CheckoutDeliveryService::METHOD_PICKUP) {
            $validated['delivery_city'] = null;
            $validated['delivery_city_id'] = null;
            $validated['delivery_street_prefix'] = null;
            $validated['delivery_house'] = null;
            $validated['delivery_korpus'] = null;
            $validated['delivery_apartment'] = null;
            $validated['delivery_comment'] = null;

            return $validated;
        }

        foreach (['delivery_street_prefix', 'delivery_house', 'delivery_korpus', 'delivery_apartment', 'delivery_comment'] as $key) {
            if (! array_key_exists($key, $validated)) {
                continue;
            }
            $value = trim((string) ($validated[$key] ?? ''));
            $validated[$key] = $value !== '' ? $value : null;
        }

        if ($method === CheckoutDeliveryService::METHOD_MINSK) {
            $validated['delivery_city'] = CheckoutDeliveryService::MINSK_CITY;
            $validated['delivery_city_id'] = null;

            return $validated;
        }

        if ($method === CheckoutDeliveryService::METHOD_BELARUS) {
            $cityId = (int) ($validated['delivery_city_id'] ?? 0);
            abort_if($cityId <= 0, 422, 'Выберите населённый пункт из списка');

            $city = VeterCity::query()
                ->active()
                ->with(['district', 'track'])
                ->find($cityId);

            abort_if(! $city, 422, 'Населённый пункт не найден или недоступен');

            $validated['delivery_city_id'] = (int) $city->id;
            $validated['delivery_city'] = $city->full_name;

            return $validated;
        }

        $validated['delivery_city_id'] = null;

        return $validated;
    }
}
