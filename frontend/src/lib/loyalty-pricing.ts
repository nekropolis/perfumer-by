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

