"use client";

import { useAuth } from "@/components/auth/auth-provider";
import type { ProductListItem } from "@/types/catalog";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import {
    applyPercentDiscount,
    resolveActiveLoyaltyCard,
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

    const loyaltyMin = applyPercentDiscount(loyaltyRange.min, loyaltyCard.discountPercent ?? 0);
    const loyaltyMax = applyPercentDiscount(loyaltyRange.max, loyaltyCard.discountPercent ?? 0);
    const loyaltyMinFmt = formatMoneyDisplay(loyaltyMin);
    const loyaltyMaxFmt = formatMoneyDisplay(loyaltyMax);

    const loyaltyPriceText =
        loyaltyMinFmt && loyaltyMaxFmt
            ? loyaltyMinFmt !== loyaltyMaxFmt
                ? `${loyaltyMinFmt} – ${loyaltyMaxFmt} BYN`
                : `${loyaltyMinFmt} BYN`
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
