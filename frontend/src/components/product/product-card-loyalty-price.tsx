"use client";

import { useAuth } from "@/components/auth/auth-provider";
import type { ProductListItem } from "@/types/catalog";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { withBynSign, withBynSignRange } from "@/lib/byn-sign";
import {
    resolveActiveLoyaltyCard,
    resolveDiscountedPrice,
    resolveProductListLoyaltyPriceRange,
} from "@/lib/loyalty-pricing";

type Props = {
    product: ProductListItem;
};

export default function ProductCardLoyaltyPrice({ product }: Props) {
    const { user, isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return null;
    }

    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    if (!loyaltyCard) {
        return null;
    }

    const loyaltyRange = resolveProductListLoyaltyPriceRange(product);
    if (!loyaltyRange) {
        return null;
    }

    const oldMin = product.has_discount ? (product.old_price_range?.min ?? null) : null;
    const oldMax = product.has_discount ? (product.old_price_range?.max ?? null) : null;
    const cardPercent = loyaltyCard.discountPercent ?? 0;

    const loyaltyMin = resolveDiscountedPrice(loyaltyRange.min, {
        loyaltyPercent: cardPercent,
        oldPrice: oldMin,
    });
    const loyaltyMax = resolveDiscountedPrice(loyaltyRange.max ?? loyaltyRange.min, {
        loyaltyPercent: cardPercent,
        oldPrice: oldMax ?? oldMin,
    });

    // Нет доп. скидки карты поверх товарной — не дублируем ту же цену.
    if (
        loyaltyMin === loyaltyRange.min &&
        loyaltyMax === (loyaltyRange.max ?? loyaltyRange.min)
    ) {
        return null;
    }

    const loyaltyMinFmt = formatMoneyDisplay(loyaltyMin);
    const loyaltyMaxFmt = formatMoneyDisplay(loyaltyMax);

    const loyaltyPriceText =
        loyaltyMinFmt && loyaltyMaxFmt
            ? loyaltyMinFmt !== loyaltyMaxFmt
                ? withBynSignRange(loyaltyMinFmt, loyaltyMaxFmt)
                : withBynSign(loyaltyMinFmt)
            : null;

    if (!loyaltyPriceText) {
        return null;
    }

    return (
        <div className="mt-1 text-[10px] font-medium text-emerald-700">
            По карте: {loyaltyPriceText}
        </div>
    );
}
