<?php

namespace Modules\Catalog\Support;

final class WaitingDiscountPricing
{
    public const DISCOUNT_PERCENT = 3.0;

    /**
     * Скидка 3% за ожидание доставки.
     * Итоговая цена округляется до десятых BYN по цифре сотых (102,88 → 102,90; 102,82 → 102,80).
     */
    public static function apply(float $price): float
    {
        if ($price <= 0) {
            return 0.0;
        }

        $discounted = $price * (1 - self::DISCOUNT_PERCENT / 100);

        return round($discounted, 1);
    }

    public static function discountAmount(float $price): float
    {
        if ($price <= 0) {
            return 0.0;
        }

        return round($price - self::apply($price), 2);
    }

    /**
     * Опциональная скидка «хочу 3% за ожидание» не даётся, если вход офера
     * выше входа склада. Сравнение по копейкам: склад 50.00 и офер 50.00 — скидка
     * остаётся; офер 50.01 — нет. Нет одной из цен — не блокируем.
     */
    public static function offerPurchaseExceedsWarehousePurchase(?float $warehousePurchase, ?float $offerPurchase): bool
    {
        if ($warehousePurchase === null || $offerPurchase === null || $warehousePurchase <= 0 || $offerPurchase <= 0) {
            return false;
        }

        return round($offerPurchase, 2) > round($warehousePurchase, 2);
    }
}
