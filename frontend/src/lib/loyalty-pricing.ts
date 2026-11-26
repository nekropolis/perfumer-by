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

/** Цена единицы после скидки карты, до десятых BYN как на витрине (153.30 × 5% → 145.60). */
export function loyaltyDiscountedUnitPrice(
    price: string | null | undefined,
    oldPrice: string | null | undefined,
    cardPercent: number,
    isPromotion?: boolean | null,
): string | null {
    if (!price || isPromotion) {
        return price ?? null;
    }

    const current = Number(price);
    if (!Number.isFinite(current) || current <= 0) {
        return price;
    }

    const extra = loyaltyExtraPercent(price, oldPrice, cardPercent);
    if (extra <= 0) {
        return Number(current).toFixed(2);
    }

    return roundMoneyToTenths((current * (1 - extra / 100)).toFixed(4)) ?? "0.00";
}

/** Сумма скидки карты на единицу: цена − округлённая до десятых цена со скидкой. */
export function loyaltyUnitDiscountAmount(
    price: string | null | undefined,
    oldPrice: string | null | undefined,
    cardPercent: number,
    isPromotion?: boolean | null,
): number {
    if (!price || isPromotion) {
        return 0;
    }

    const current = Number(price);
    if (!Number.isFinite(current) || current <= 0) {
        return 0;
    }

    const discounted = loyaltyDiscountedUnitPrice(price, oldPrice, cardPercent, isPromotion);
    if (!discounted) {
        return 0;
    }

    const discountedValue = Number(discounted);
    if (!Number.isFinite(discountedValue) || discountedValue >= current) {
        return 0;
    }

    return Math.round((current - discountedValue) * 100) / 100;
}

/** Скидка по накопительной карте не применяется к акционным вариантам. */
export function isVariantEligibleForLoyaltyCardDiscount(isPromotion?: boolean | null): boolean {
    return !isPromotion;
}

/** Скидка 3% за ожидание — только при наличии оферов (не «только склад»).
 *  Для «склад + офер» бэкенд обнуляет waiting_discount_percent, если вход офера выше входа склада. */
export function isVariantEligibleForWaitingDiscount(
    isPromotion?: boolean | null,
    availabilitySource?: string | null,
    waitingDiscountPercent?: number | null,
): boolean {
    if (isPromotion) {
        return false;
    }

    if (availabilitySource === "supplier_only") {
        return true;
    }

    return availabilitySource === "main+supplier" && (waitingDiscountPercent ?? 0) > 0;
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

    return roundMoneyToTenths(final.toFixed(4)) ?? "0.00";
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

/** Процент карты, который реально вычтен из заказа. Снимок % без суммы скидки не показываем. */
export function appliedCardDiscountPercent(
    discountAmount: string | number | null | undefined,
    discountPercent: string | number | null | undefined,
): number {
    const amount = Number(String(discountAmount ?? "").replace(",", "."));
    const percent = Number(String(discountPercent ?? "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0.004) {
        return 0;
    }
    if (!Number.isFinite(percent) || percent <= 0) {
        return 0;
    }
    return percent;
}

/** Сумма скидок строки: 3% за ожидание и процент карты складываются. */
export function combinedLineDiscountPercent(waiting: boolean, cardPercent: number): number {
    const card = Number.isFinite(cardPercent) && cardPercent > 0 ? cardPercent : 0;
    return (waiting ? WAITING_DISCOUNT_PERCENT : 0) + card;
}

export function formatCombinedLineDiscountPercent(waiting: boolean, cardPercent: number): string | null {
    const total = combinedLineDiscountPercent(waiting, cardPercent);
    if (total <= 0) {
        return null;
    }
    return formatDiscountPercentSnapshot(String(total));
}

function moneyToCents(value: string | number): number {
    const normalized = String(value).replace(",", ".").trim();
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
        return 0;
    }
    return Math.round(Number(normalized) * 100);
}

function centsToMoney(cents: number): string {
    return (cents / 100).toFixed(2);
}

/** Цена до 3% за ожидание. 45.70 при включённом ожидании → 47.10. */
export function unitPriceBeforeWaitingDiscount(price: string, waiting: boolean): string {
    const current = Number(String(price).replace(",", "."));
    if (!waiting || !Number.isFinite(current) || current <= 0) {
        return Number.isFinite(current) ? current.toFixed(2) : "0.00";
    }
    const base = Math.round((current / (1 - WAITING_DISCOUNT_PERCENT / 100)) * 10) / 10;
    return base.toFixed(2);
}

export type ReceiptLineDiscount = {
    /** Цена единицы до скидок. */
    unitPrice: string;
    /** Цена единицы после скидок. */
    saleUnit: string;
    /** Сумма без скидки. */
    gross: string;
    /** Суммарный процент скидки строки, без знака. Пусто, если скидки нет. */
    percentLabel: string;
    /** Сумма скидки по строке (ожидание + карта). */
    discount: string;
    /** Сумма строки после скидок. */
    net: string;
};

/**
 * Скидка по строкам чека. Проценты складываются (3% + карта).
 * Сумма скидки карты подгоняется под discount_amount заказа, чтобы итог чека совпал.
 */
export function receiptLineDiscounts(
    items: { price: string; qty: number; waiting: boolean }[],
    cardPercent: number,
    orderDiscountAmount?: string | number | null,
): ReceiptLineDiscount[] {
    const card = Number.isFinite(cardPercent) && cardPercent > 0 ? cardPercent : 0;
    const drafted = items.map((item) => {
        const qty = Math.max(0, item.qty);
        const unit = unitPriceBeforeWaitingDiscount(item.price, item.waiting);
        const unitCents = moneyToCents(unit);
        const priceCents = moneyToCents(item.price);
        const grossCents = unitCents * qty;
        const waitingCents = item.waiting && unitCents > priceCents ? (unitCents - priceCents) * qty : 0;
        const cardUnit = card > 0 ? loyaltyUnitDiscountAmount(unit, null, card) : 0;
        const cardCents = Math.round(cardUnit * 100) * qty;
        return { qty, unit, unitCents, grossCents, waitingCents, cardCents, waiting: item.waiting };
    });

    if (orderDiscountAmount != null && orderDiscountAmount !== "") {
        const cardPool = drafted.reduce((sum, line) => sum + line.cardCents, 0);
        let remainder = moneyToCents(orderDiscountAmount) - cardPool;
        if (remainder !== 0) {
            for (let i = drafted.length - 1; i >= 0 && remainder !== 0; i -= 1) {
                const line = drafted[i];
                if (line.qty <= 0) {
                    continue;
                }
                const next = line.cardCents + remainder;
                if (next < 0) {
                    remainder = next;
                    line.cardCents = 0;
                } else {
                    line.cardCents = next;
                    remainder = 0;
                }
            }
        }
    }

    return drafted.map((line) => {
        const discountCents = line.waitingCents + line.cardCents;
        const netCents = Math.max(0, line.grossCents - discountCents);
        const percent = (line.waiting ? WAITING_DISCOUNT_PERCENT : 0) + (line.cardCents > 0 ? card : 0);
        const saleUnitCents = line.qty > 0 ? Math.round(netCents / line.qty) : 0;
        return {
            unitPrice: line.unit,
            saleUnit: centsToMoney(saleUnitCents),
            gross: centsToMoney(line.grossCents),
            percentLabel: percent > 0 ? (formatDiscountPercentSnapshot(String(percent)) ?? "") : "",
            discount: centsToMoney(discountCents),
            net: centsToMoney(netCents),
        };
    });
}

