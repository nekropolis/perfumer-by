import { describe, expect, it } from "vitest";
import {
    appliedCardDiscountPercent,
    formatCombinedLineDiscountPercent,
    receiptLineDiscounts,
} from "@/lib/loyalty-pricing";

describe("combined line discount percent", () => {
    it("adds waiting and card percents", () => {
        expect(formatCombinedLineDiscountPercent(true, 5)).toBe("8");
        expect(formatCombinedLineDiscountPercent(false, 5)).toBe("5");
        expect(formatCombinedLineDiscountPercent(true, 0)).toBe("3");
        expect(formatCombinedLineDiscountPercent(false, 0)).toBeNull();
    });

    it("ignores a card percent when the order discount amount is zero", () => {
        expect(appliedCardDiscountPercent("0.00", "5.00")).toBe(0);
        expect(appliedCardDiscountPercent("17.30", "5.00")).toBe(5);
    });
});

describe("receipt line discounts", () => {
    it("splits 3% waiting and 5% card from the same base and keeps the order total", () => {
        const lines = receiptLineDiscounts(
            [
                { price: "45.70", qty: 1, waiting: true },
                { price: "297.50", qty: 1, waiting: false },
            ],
            5,
            "17.30",
        );

        expect(lines[0]).toMatchObject({
            unitPrice: "47.10",
            saleUnit: "43.30",
            gross: "47.10",
            percentLabel: "8",
            discount: "3.80",
            net: "43.30",
        });
        expect(lines[1]).toMatchObject({
            unitPrice: "297.50",
            saleUnit: "282.60",
            gross: "297.50",
            percentLabel: "5",
            discount: "14.90",
            net: "282.60",
        });
        expect(Number(lines[0].net) + Number(lines[1].net)).toBeCloseTo(325.9, 2);
    });
});
