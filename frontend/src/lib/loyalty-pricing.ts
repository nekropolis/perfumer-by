export const MAX_LOYALTY_CARD_DISCOUNT_PERCENT = 10;

export const WAITING_DISCOUNT_PERCENT = 3;

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

/**
 * Точный процент скидки товара: (old − price) / old × 100.
 * 0 если old_price нет или не выше текущей цены.
 */
export function productDiscountPercent(
    price: string | null | undefined,
    oldPrice: string | null | undefined,
): number {
    if (!price || !oldPrice) {
        return 0;
    }

    const current = Number(price);
    const old = Number(oldPrice);
    if (!Number.isFinite(current) || !Number.isFinite(old) || old <= 0 || old <= current) {
        return 0;
    }

    return ((old - current) / old) * 100;
}

/**
 * Доп. процент карты поверх скидки товара: max(0, C − D).
 */
export function loyaltyExtraPercent(
    price: string | null | undefined,
    oldPrice: string | null | undefined,
    cardPercent: number,
): number {
    const card = Math.max(0, cardPercent);
    if (card <= 0) {
        return 0;
    }

    return Math.max(0, card - productDiscountPercent(price, oldPrice));
}

/** Сумма скидки карты на единицу (текущая цена × доп.%). */
export function loyaltyUnitDiscountAmount(
    price: string | null | undefined,
    oldPrice: string | null | undefined,
    cardPercent: number,
): number {
    if (!price) {
        return 0;
    }

    const current = Number(price);
    if (!Number.isFinite(current) || current <= 0) {
        return 0;
    }

    const extra = loyaltyExtraPercent(price, oldPrice, cardPercent);
    if (extra <= 0) {
        return 0;
    }

    return Math.round(current * (extra / 100) * 100) / 100;
}

/** Скидка по накопительной карте не применяется к акционным вариантам. */
export function isVariantEligibleForLoyaltyCardDiscount(isPromotion?: boolean | null): boolean {
    return !isPromotion;
}

/** Скидка 3% за ожидание — только при наличии оферов (не «только склад»). */
export function isVariantEligibleForWaitingDiscount(
    isPromotion?: boolean | null,
    availabilitySource?: string | null,
): boolean {
    if (isPromotion) {
        return false;
    }

    // supplier_only — принудительно; main+supplier — опциональный чекбокс
    return availabilitySource === "main+supplier" || availabilitySource === "supplier_only";
}

/** Применить скидку 3% за ожидание доставки с округлением до десятых BYN. */
export function applyWaitingDiscount(price: string | null): string | null {
    const discounted = applyPercentDiscount(price, WAITING_DISCOUNT_PERCENT);
    return roundMoneyToTenths(discounted);
}

/** Округлить сумму до десятых BYN по цифре сотых (102,88 → 102,90; 102,82 → 102,80). */
export function roundMoneyToTenths(raw: string | null): string | null {
    if (!raw) {
        return null;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return null;
    }

    return (Math.round(value * 10) / 10).toFixed(2);
}

/** Итоговая цена с учётом накопительной карты и скидки за ожидание.
 *  Порядок как в корзине: waiting от каталожной цены, затем вычитается сумма доп. скидки карты
 *  (max(0, C−D)% от текущей цены; D из old_price). */
export function resolveDiscountedPrice(
    price: string | null,
    options: {
        isPromotion?: boolean | null;
        loyaltyPercent?: number;
        waitingActive?: boolean;
        oldPrice?: string | null;
    },
): string | null {
    if (!price || options.isPromotion) {
        return price;
    }

    const waitingPrice = options.waitingActive ? applyWaitingDiscount(price) : price;
    if (!waitingPrice) {
        return null;
    }

    const loyaltyPercent = options.loyaltyPercent ?? 0;
    if (loyaltyPercent <= 0) {
        return waitingPrice;
    }

    const loyaltyAmount = loyaltyUnitDiscountAmount(price, options.oldPrice, loyaltyPercent);
    if (loyaltyAmount <= 0) {
        return waitingPrice;
    }

    const final = Number(waitingPrice) - loyaltyAmount;

    if (final <= 0) {
        return "0.00";
    }

    return final.toFixed(2);
}

type LoyaltyCardPriceRange = {
    min: string | null;
    max: string | null;
};

/** Диапазон цен для подписи «По карте» в листинге (без акционных вариантов). */
export function resolveProductListLoyaltyPriceRange(product: {
    listing_variant_id?: number | null;
    loyalty_price_range?: LoyaltyCardPriceRange | null;
    price_range?: LoyaltyCardPriceRange | null;
}): LoyaltyCardPriceRange | null {
    if (product.listing_variant_id) {
        return null;
    }

    const range = product.loyalty_price_range ?? product.price_range;
    if (!range?.min) {
        return null;
    }

    return range;
}

