import type { CheckoutLineSelectionStored, CheckoutQuote } from "@/lib/checkout-api";
import type { CartData } from "@/types/cart";

export function parseCheckoutMoney(s: string): number {
    const n = Number.parseFloat(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
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
        const baseCents = Math.round(parseCheckoutMoney(item.base_price) * 100);
        const priceCents = Math.round(parseCheckoutMoney(item.price) * 100);
        cents += Math.max(0, baseCents - priceCents) * item.qty;
    }
    return (cents / 100).toFixed(2);
}

export function breakdownSubtotalFromQuote(quote: CheckoutQuote): string {
    const giftPurchase = quote.gift_certificates_purchase_subtotal
        ? parseCheckoutMoney(quote.gift_certificates_purchase_subtotal)
        : 0;
    return Math.max(0, parseCheckoutMoney(quote.subtotal) + giftPurchase).toFixed(2);
}

export function merchandisePayFromQuote(quote: CheckoutQuote): string {
    const giftPurchase = quote.gift_certificates_purchase_subtotal
        ? parseCheckoutMoney(quote.gift_certificates_purchase_subtotal)
        : 0;
    return Math.max(
        0,
        parseCheckoutMoney(quote.subtotal) -
            parseCheckoutMoney(quote.loyalty_discount_amount) -
            parseCheckoutMoney(quote.gift_certificate_amount) +
            giftPurchase,
    ).toFixed(2);
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
    if (parseCheckoutMoney(quote.loyalty_discount_amount) > 0 && cart.discount_card) {
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
    if (parseCheckoutMoney(quote.gift_certificate_amount) > 0 && cart.gift_certificate) {
        return {
            code: cart.gift_certificate.code,
            number: cart.gift_certificate.number,
            amount: quote.gift_certificate_amount,
        };
    }
    return null;
}
