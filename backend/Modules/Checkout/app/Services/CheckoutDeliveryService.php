<?php

namespace Modules\Checkout\Services;

use Modules\Cart\Models\Cart;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Settings\Services\ShopSettingService;

final class CheckoutDeliveryService
{
    public const METHOD_MINSK = 'minsk_courier';

    public const METHOD_BELARUS = 'belarus_courier';

    public const METHOD_PICKUP = 'pickup';

    public const MINSK_CITY = 'Минск';

    public function __construct(
        private readonly ShopSettingService $shopSettings,
    ) {}

    /**
     * @param  int[]|null  $checkoutCartItemIds  null — все строки товаров в корзине; иначе только id cart_items для подсчёта единиц по РБ.
     */
    public function deliveryFee(Cart $cart, string $deliveryMethod, float $merchandiseAfterLoyaltyDiscount, ?array $checkoutCartItemIds = null): float
    {
        return match ($deliveryMethod) {
            self::METHOD_PICKUP => 0.0,
            self::METHOD_MINSK => $this->minskCourierFee($merchandiseAfterLoyaltyDiscount),
            self::METHOD_BELARUS => $this->belarusCourierFee($cart, $checkoutCartItemIds),
            default => 0.0,
        };
    }

    /**
     * Расчёт доставки для админского заказа (без корзины).
     *
     * @param  list<array{variant_id: int|null, qty: int}>  $lines
     */
    public function deliveryFeeForOrderLines(string $deliveryMethod, float $merchandiseAfterLoyaltyDiscount, array $lines): float
    {
        return match ($deliveryMethod) {
            self::METHOD_PICKUP => 0.0,
            self::METHOD_MINSK => $this->minskCourierFee($merchandiseAfterLoyaltyDiscount),
            self::METHOD_BELARUS => $this->belarusCourierFeeForLines($lines),
            default => 0.0,
        };
    }

    private function minskCourierFee(float $merchandiseAfterLoyaltyDiscount): float
    {
        $threshold = $this->shopSettings->getDecimal('delivery_minsk_free_threshold', 50);
        $fee = $this->shopSettings->getDecimal('delivery_minsk_fee', 3);
        if ($merchandiseAfterLoyaltyDiscount + 0.0001 >= $threshold) {
            return 0.0;
        }

        return $fee;
    }

    private function belarusCourierFee(Cart $cart, ?array $checkoutCartItemIds = null): float
    {
        $rows = $cart->items;
        if ($checkoutCartItemIds !== null) {
            if ($checkoutCartItemIds === []) {
                $rows = collect();
            } else {
                $allowed = array_fill_keys(array_map('intval', $checkoutCartItemIds), true);
                $rows = $rows->filter(fn ($item) => isset($allowed[(int) $item->id]));
            }
        }

        $lines = [];
        foreach ($rows as $item) {
            $lines[] = [
                'variant_id' => $item->variant ? (int) $item->variant->id : null,
                'qty' => max(0, (int) $item->qty),
            ];
        }

        return $this->belarusCourierFeeForLines($lines);
    }

    /**
     * @param  list<array{variant_id: int|null, qty: int}>  $lines
     */
    private function belarusCourierFeeForLines(array $lines): float
    {
        $minUnits = max(1, $this->shopSettings->getInt('delivery_belarus_free_min_lines', 2));
        $fee = $this->shopSettings->getDecimal('delivery_belarus_fee', 6);

        $ids = [];
        foreach ($lines as $line) {
            $id = (int) ($line['variant_id'] ?? 0);
            if ($id > 0) {
                $ids[$id] = true;
            }
        }

        $variantsById = [];
        if ($ids !== []) {
            $variantsById = ProductVariantLink::query()
                ->with('definition')
                ->whereIn('id', array_keys($ids))
                ->get()
                ->keyBy('id')
                ->all();
        }

        $eligibleUnits = 0;
        foreach ($lines as $line) {
            $id = (int) ($line['variant_id'] ?? 0);
            $variant = $variantsById[$id] ?? null;
            if (! $variant) {
                continue;
            }
            if ((bool) ($variant->definition?->excludes_from_free_delivery_threshold ?? false)) {
                continue;
            }
            $eligibleUnits += max(0, (int) ($line['qty'] ?? 0));
        }

        if ($eligibleUnits >= $minUnits) {
            return 0.0;
        }

        return $fee;
    }
}
