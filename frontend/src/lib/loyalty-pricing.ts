export const MAX_LOYALTY_CARD_DISCOUNT_PERCENT = 10;

export type ActiveLoyaltyCard = {
    number: string;
    discountPercent: number;
};

export function resolveActiveLoyaltyCard(
    cards: { number: string; discount_percent: string; is_active: boolean }[] | undefined
): ActiveLoyaltyCard | null {
    if (!cards?.length) {
        return null;
    }

    const active = cards
        .filter((card) => card.is_active)
        .map((card) => ({
            number: card.number,
            discountPercent: Math.min(
                MAX_LOYALTY_CARD_DISCOUNT_PERCENT,
                Math.max(0, Number(card.discount_percent) || 0)
            ),
        }))
        .sort((a, b) => b.discountPercent - a.discountPercent);

    return active[0] ?? null;
}

export function formatDiscountPercentSnapshot(value: string | undefined | null): string | null {
    if (value == null || value.trim() === "") {
        return null;
    }

    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }

    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/** Подпись скидки по карте в заказе (список ЛК и т.п.). */
export function formatOrderLoyaltyCardDiscountReason(
    cardNumber: string | undefined | null,
    percentSnapshot: string | undefined | null,
): string {
    const cardNo = cardNumber?.trim();
    if (cardNo) {
        return `карта ${cardNo}`;
    }

    const pct = formatDiscountPercentSnapshot(percentSnapshot);
    if (pct) {
        return `карта лояльности (${pct}%)`;
    }

    return "карта лояльности";
}

export function applyPercentDiscount(price: string | null, percent: number): string | null {
    if (!price) {
        return null;
    }

    const base = Number(price);
    if (!Number.isFinite(base)) {
        return null;
    }

    const discounted = base * (1 - percent / 100);
    return discounted.toFixed(2);
}

