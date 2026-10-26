import type { CheckoutLineSelectionStored, CheckoutQuote } from "@/lib/checkout-api";
import { formatMoneyMinorUnits, parseMoneyMinorUnits } from "@/lib/format-byn";
import { resolveDiscountedPrice } from "@/lib/loyalty-pricing";
import type { CartData } from "@/types/cart";

/** Сумма в рублях для проверок знака. Арифметика сумм идёт через копейки. */
export function parseCheckoutMoney(s: string): number {
    const minor = parseMoneyMinorUnits(s);
    if (minor === 0) {
        return 0;
    }
    const negative = minor < 0;
    const abs = Math.abs(minor);
    const value = Math.floor(abs / 100) + (abs % 100) / 100;
    return negative ? -value : value;
}

export function selectionSignature(selection: CheckoutLineSelectionStored): string {
    return JSON.stringify({
        p: [...selection.cart_item_ids].sort((a, b) => a - b),
        g: [...selection.gift_certificate_cart_item_ids].sort((a, b) => a - b),
    });
}

/** Убирает id строк, которых уже нет в корзине. */
export function sanitizeCheckoutLineSelectionForCart(
    cart: CartData | null,
    selection: CheckoutLineSelectionStored | null,
): CheckoutLineSelectionStored | null {
    if (!cart || !selection) {
        return null;
    }
    const productIds = new Set(cart.items.map((item) => item.id));
    const giftLineIds = new Set((cart.gift_certificate_items ?? []).map((row) => row.id));
    const cartIds = selection.cart_item_ids.filter((id) => productIds.has(id));
    const giftIds = selection.gift_certificate_cart_item_ids.filter((id) => giftLineIds.has(id));
    if (cartIds.length === 0 && giftIds.length === 0) {
        return null;
    }
    return { cart_item_ids: cartIds, gift_certificate_cart_item_ids: giftIds };
}

/** `null` — оформляется вся корзина (без фильтра по id). */
export function buildPartialCheckoutSelection(
    cart: CartData,
    selectedCartItemIds: Set<number>,
    selectedGiftLineIds: Set<number>,
): CheckoutLineSelectionStored | null {
    const allProductsSelected = cart.items.every((i) => selectedCartItemIds.has(i.id));
    const gifts = cart.gift_certificate_items ?? [];
    const allGiftsSelected = gifts.length === 0 || gifts.every((i) => selectedGiftLineIds.has(i.id));
    if (allProductsSelected && allGiftsSelected) {
        return null;
    }
    const cartIds = cart.items.filter((i) => selectedCartItemIds.has(i.id)).map((i) => i.id);
    const giftIds = gifts.filter((i) => selectedGiftLineIds.has(i.id)).map((i) => i.id);
    if (cartIds.length === 0 && giftIds.length === 0) {
        return null;
    }
    return { cart_item_ids: cartIds, gift_certificate_cart_item_ids: giftIds };
}

export function filterCartLinesForCheckout(
    cart: CartData,
    selection: CheckoutLineSelectionStored | null,
): { items: CartData["items"]; giftItems: NonNullable<CartData["gift_certificate_items"]> } {
    if (!selection) {
        return {
            items: cart.items,
            giftItems: cart.gift_certificate_items ?? [],
        };
    }
    const productIds = new Set(selection.cart_item_ids);
    const giftIds = new Set(selection.gift_certificate_cart_item_ids);
    return {
        items: cart.items.filter((item) => productIds.has(item.id)),
        giftItems: (cart.gift_certificate_items ?? []).filter((row) => giftIds.has(row.id)),
    };
}

export function countCheckoutLinesQty(
    items: CartData["items"],
    giftItems: NonNullable<CartData["gift_certificate_items"]>,
): number {
    let n = 0;
    for (const item of items) {
        n += item.qty;
    }
    for (const row of giftItems) {
        n += row.qty;
    }
    return n;
}

/** Сумма скидки 3% за ожидание доставки по выбранным позициям. */
export function waitingDiscountAmountForLines(items: CartData["items"]): string {
    let cents = 0;
    for (const item of items) {
        if (!item.waiting_discount || !item.base_price) {
            continue;
        }
        const diff = parseMoneyMinorUnits(item.base_price) - parseMoneyMinorUnits(item.price);
        if (diff <= 0) {
            continue;
        }
        cents += diff * item.qty;
    }
    return formatMoneyMinorUnits(cents);
}

/** Цена единицы как на карточке: ожидание от каталожной цены, затем скидка карты. */
export function cartItemCustomerUnitPrice(
    item: CartData["items"][number],
    loyaltyPercent: number,
): string {
    if (item.is_promotion) {
        return item.price;
    }

    const catalogPrice = item.waiting_discount && item.base_price ? item.base_price : item.price;
    return (
        resolveDiscountedPrice(catalogPrice, {
            loyaltyPercent,
            waitingActive: item.waiting_discount,
            oldPrice: item.old_price,
        }) ?? item.price
    );
}

export function cartItemCustomerLineTotal(
    item: CartData["items"][number],
    loyaltyPercent: number,
): string {
    const unit = cartItemCustomerUnitPrice(item, loyaltyPercent);
    return formatMoneyMinorUnits(parseMoneyMinorUnits(unit) * item.qty);
}

/** Зачёркнутая цена строки: база ожидания, иначе old_price, иначе цена до карты. */
export function cartItemStrikeUnitPrice(
    item: CartData["items"][number],
    loyaltyPercent: number,
): string | null {
    const unitMinor = parseMoneyMinorUnits(cartItemCustomerUnitPrice(item, loyaltyPercent));
    if (item.waiting_discount && item.base_price) {
        return parseMoneyMinorUnits(item.base_price) > unitMinor ? item.base_price : null;
    }
    if (item.old_price && parseMoneyMinorUnits(item.old_price) > unitMinor) {
        return item.old_price;
    }
    if (parseMoneyMinorUnits(item.price) > unitMinor) {
        return item.price;
    }
    return null;
}

/**
 * Полная (зачёркнутая) цена единицы: base_price при ожидании, иначе old_price при акции, иначе price.
 * Совпадает с суммой «Сумма товаров» в корзине.
 */
export function cartItemListUnitPrice(item: CartData["items"][number]): string {
    if (item.waiting_discount && item.base_price) {
        return item.base_price;
    }
    if (item.old_price) {
        if (parseMoneyMinorUnits(item.old_price) > parseMoneyMinorUnits(item.price)) {
            return item.old_price;
        }
    }
    return item.price;
}

/** Сумма товаров по полным (зачёркнутым) ценам + подарочные сертификаты к покупке. */
export function listSubtotalForLines(
    items: CartData["items"],
    giftItems: NonNullable<CartData["gift_certificate_items"]> = [],
): string {
    let cents = 0;
    for (const item of items) {
        cents += parseMoneyMinorUnits(cartItemListUnitPrice(item)) * item.qty;
    }
    for (const row of giftItems) {
        cents += parseMoneyMinorUnits(row.total);
    }
    return formatMoneyMinorUnits(cents);
}

export function merchandisePayFromQuote(quote: CheckoutQuote): string {
    const giftPurchase = quote.gift_certificates_purchase_subtotal
        ? parseMoneyMinorUnits(quote.gift_certificates_purchase_subtotal)
        : 0;
    const net =
        parseMoneyMinorUnits(quote.subtotal) -
        parseMoneyMinorUnits(quote.loyalty_discount_amount) -
        parseMoneyMinorUnits(quote.gift_certificate_amount) +
        giftPurchase;
    return formatMoneyMinorUnits(Math.max(0, net));
}

type DiscountCardLine = {
    number: string;
    discount_percent: string;
    discount_amount: string;
    session_only?: boolean;
};

type GiftLine = {
    code?: string;
    number?: string;
    amount: string;
};

export function discountCardForBreakdownFromQuote(
    cart: CartData,
    quote: CheckoutQuote | null,
): DiscountCardLine | null {
    if (quote == null) {
        return cart.discount_card ?? null;
    }
    if (parseMoneyMinorUnits(quote.loyalty_discount_amount) > 0 && cart.discount_card) {
        return {
            number: cart.discount_card.number,
            discount_percent: quote.loyalty_discount_percent,
            discount_amount: quote.loyalty_discount_amount,
            session_only: cart.discount_card.session_only,
        };
    }
    return null;
}

export function giftForBreakdownFromQuote(cart: CartData, quote: CheckoutQuote | null): GiftLine | null {
    if (quote == null) {
        return cart.gift_certificate ?? null;
    }
    if (parseMoneyMinorUnits(quote.gift_certificate_amount) > 0 && cart.gift_certificate) {
        return {
            code: cart.gift_certificate.code,
            number: cart.gift_certificate.number,
            amount: quote.gift_certificate_amount,
        };
    }
    return null;
}
