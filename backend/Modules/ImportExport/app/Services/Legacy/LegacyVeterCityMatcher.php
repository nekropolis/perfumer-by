<?php

namespace Modules\ImportExport\Services\Legacy;

use Modules\Checkout\Models\VeterCity;
use Modules\Checkout\Services\CheckoutDeliveryService;

/**
 * Сопоставление текста города легаси с VeterCity + эвристика способа доставки.
 */
final class LegacyVeterCityMatcher
{
    /** @var list<\Modules\Checkout\Models\VeterCity>|null */
    private ?array $citiesCache = null;

    /**
     * @return array{
     *     delivery_method: string|null,
     *     delivery_city: string|null,
     *     delivery_city_id: int|null,
     *     city_matched: bool
     * }
     */
    public function resolve(?string $shippingCity, ?string $shippingMethod): array
    {
        $method = $this->normalizeDeliveryMethod($shippingMethod);
        $cityRaw = trim((string) $shippingCity);

        if ($cityRaw === '') {
            return [
                'delivery_method' => $method,
                'delivery_city' => null,
                'delivery_city_id' => null,
                'city_matched' => false,
            ];
        }

        if ($this->looksLikeMinsk($cityRaw)) {
            $method ??= CheckoutDeliveryService::METHOD_MINSK;

            return [
                'delivery_method' => $method === CheckoutDeliveryService::METHOD_PICKUP
                    ? CheckoutDeliveryService::METHOD_PICKUP
                    : CheckoutDeliveryService::METHOD_MINSK,
                'delivery_city' => CheckoutDeliveryService::MINSK_CITY,
                'delivery_city_id' => null,
                'city_matched' => true,
            ];
        }

        $matched = $this->matchVeterCity($cityRaw);
        if ($matched !== null) {
            $method ??= CheckoutDeliveryService::METHOD_BELARUS;

            return [
                'delivery_method' => $method === CheckoutDeliveryService::METHOD_PICKUP
                    ? CheckoutDeliveryService::METHOD_PICKUP
                    : ($method === CheckoutDeliveryService::METHOD_MINSK
                        ? CheckoutDeliveryService::METHOD_MINSK
                        : CheckoutDeliveryService::METHOD_BELARUS),
                'delivery_city' => $matched->full_name,
                'delivery_city_id' => (int) $matched->id,
                'city_matched' => true,
            ];
        }

        $method ??= CheckoutDeliveryService::METHOD_BELARUS;

        return [
            'delivery_method' => $method,
            'delivery_city' => mb_substr($cityRaw, 0, 255),
            'delivery_city_id' => null,
            'city_matched' => false,
        ];
    }

    public function normalizeDeliveryMethod(?string $shippingMethod): ?string
    {
        $raw = mb_strtolower(trim((string) $shippingMethod), 'UTF-8');
        if ($raw === '') {
            return null;
        }

        if (str_contains($raw, 'самовывоз') || str_contains($raw, 'pickup') || str_contains($raw, 'pick-up')) {
            return CheckoutDeliveryService::METHOD_PICKUP;
        }
        if (str_contains($raw, 'минск') || str_contains($raw, 'minsk')) {
            return CheckoutDeliveryService::METHOD_MINSK;
        }
        if (
            str_contains($raw, 'беларус')
            || str_contains($raw, 'рб')
            || str_contains($raw, 'belarus')
            || str_contains($raw, 'курьер')
            || str_contains($raw, 'доставк')
        ) {
            return CheckoutDeliveryService::METHOD_BELARUS;
        }

        return null;
    }

    private function looksLikeMinsk(string $city): bool
    {
        $n = $this->normalizeCityName($city);

        return $n === 'минск' || str_starts_with($n, 'минск ');
    }

    private function matchVeterCity(string $cityRaw): ?VeterCity
    {
        $normalized = $this->normalizeCityName($cityRaw);
        if ($normalized === '') {
            return null;
        }

        $cities = $this->cities();

        $exact = [];
        $prefix = [];
        $contains = [];

        foreach ($cities as $city) {
            $nameNorm = $this->normalizeCityName((string) $city->name);
            if ($nameNorm === '') {
                continue;
            }
            if ($nameNorm === $normalized) {
                $exact[] = $city;
                continue;
            }
            if (str_starts_with($nameNorm, $normalized) || str_starts_with($normalized, $nameNorm)) {
                $prefix[] = $city;
                continue;
            }
            if (str_contains($nameNorm, $normalized) || str_contains($normalized, $nameNorm)) {
                $contains[] = $city;
            }
        }

        foreach ([$exact, $prefix, $contains] as $bucket) {
            if (count($bucket) === 1) {
                return $bucket[0];
            }
        }

        return null;
    }

    /**
     * @return list<VeterCity>
     */
    private function cities(): array
    {
        if ($this->citiesCache !== null) {
            return $this->citiesCache;
        }

        $this->citiesCache = VeterCity::query()
            ->active()
            ->with(['district', 'track'])
            ->get()
            ->all();

        return $this->citiesCache;
    }

    private function normalizeCityName(string $value): string
    {
        $value = mb_strtolower(trim($value), 'UTF-8');
        $value = str_replace(['ё'], ['е'], $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;
        $value = preg_replace('/^(г\.|город)\s*/u', '', $value) ?? $value;
        $value = preg_replace('/\s*(г\.|город)$/u', '', $value) ?? $value;
        $value = trim($value, " \t\n\r\0\x0B,.-");

        return $value;
    }
}
