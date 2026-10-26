import { describe, expect, it } from "vitest";
import type { CheckoutQuote } from "@/lib/checkout-api";
import type { CartItemData } from "@/types/cart";
import {
    cartItemCustomerLineTotal,
    cartItemCustomerUnitPrice,
    listSubtotalForLines,
    merchandisePayFromQuote,
    parseCheckoutMoney,
    waitingDiscountAmountForLines,
} from "./checkout-line-selection";

function cartItem(overrides: Partial<CartItemData> & Pick<CartItemData, "id" | "price" | "qty">): CartItemData {
    return {
        product_id: 1,
        product_variant_id: 1,
        product_name: "Товар",
        product_slug: "tovar",
        brand_name: "Бренд",
        variant: null,
        base_price: null,
        old_price: null,
        total: overrides.price,
        stock: 1,
        is_preorder: false,
        is_available: true,
        waiting_discount: false,
        waiting_discount_percent: null,
        availability_source: "main",
        ...overrides,
    };
}

function quote(overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
    return {
        subtotal: "0.00",
        loyalty_discount_percent: "0",
        loyalty_discount_amount: "0.00",
        gift_certificate_amount: "0.00",
        delivery_fee: "0.00",
        total: "0.00",
        ...overrides,
    };
}

describe("checkout money strings", () => {
    it("keeps a zero fallback for empty and invalid amounts", () => {
        expect(parseCheckoutMoney("")).toBe(0);
        expect(parseCheckoutMoney("abc")).toBe(0);
        expect(parseCheckoutMoney("12,50")).toBe(12.5);
    });

    it("subtracts quote amounts exactly", () => {
        expect(
            merchandisePayFromQuote(
                quote({
                    subtotal: "10.10",
                    loyalty_discount_amount: "3.05",
                }),
            ),
        ).toBe("7.05");
    });

    it("adds fractional line prices exactly", () => {
        expect(
            listSubtotalForLines(
                [
                    cartItem({ id: 1, price: "0.10", qty: 1 }),
                    cartItem({ id: 2, price: "0.20", qty: 1 }),
                ],
                [],
            ),
        ).toBe("0.30");
    });

    it("applies the card discount on top of the waiting price once", () => {
        const item = cartItem({
            id: 1,
            price: "890.20",
            base_price: "917.70",
            qty: 1,
            waiting_discount: true,
            waiting_discount_percent: 3,
        });

        expect(cartItemCustomerUnitPrice(item, 3)).toBe("862.70");
        expect(cartItemCustomerLineTotal(item, 3)).toBe("862.70");
        expect(cartItemCustomerUnitPrice({ ...item, is_promotion: true }, 3)).toBe("890.20");
    });

    it("multiplies the waiting discount in minor units", () => {
        expect(
            waitingDiscountAmountForLines([
                cartItem({
                    id: 1,
                    price: "9.70",
                    base_price: "10.00",
                    qty: 2,
                    waiting_discount: true,
                }),
            ]),
        ).toBe("0.60");
    });
});
