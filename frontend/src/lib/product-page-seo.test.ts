import { describe, expect, it } from "vitest";
import {
    PRODUCT_META_TITLE_MAX_LENGTH,
    buildAutomaticProductMetaTitle,
    buildProductMetaTitle,
    hasManualProductSeoTitle,
} from "./product-page-seo";

describe("hasManualProductSeoTitle", () => {
    it("treats empty and display-name values as non-manual", () => {
        expect(hasManualProductSeoTitle(null, "Dior Sauvage")).toBe(false);
        expect(hasManualProductSeoTitle("", "Dior Sauvage")).toBe(false);
        expect(hasManualProductSeoTitle("  ", "Dior Sauvage")).toBe(false);
        expect(hasManualProductSeoTitle("Dior Sauvage", "Dior Sauvage")).toBe(false);
        expect(hasManualProductSeoTitle("  Dior Sauvage  ", "Dior Sauvage")).toBe(false);
    });

    it("detects a custom override", () => {
        expect(hasManualProductSeoTitle("Dior Sauvage купить", "Dior Sauvage")).toBe(true);
    });
});

describe("buildAutomaticProductMetaTitle", () => {
    it("includes price when it fits", () => {
        expect(buildAutomaticProductMetaTitle("Dior Sauvage", "199.00")).toBe(
            "Dior Sauvage купить в Минске и Беларуси — цена 199.00 BYN",
        );
    });

    it("drops price when the full title is too long", () => {
        const name = "Maison Francis Kurkdjian Baccarat Rouge 540";
        const title = buildAutomaticProductMetaTitle(name, "450.00");
        expect(title).not.toContain("цена");
        expect(title.length).toBeLessThanOrEqual(PRODUCT_META_TITLE_MAX_LENGTH);
        expect(title.startsWith(name) || title === name.slice(0, PRODUCT_META_TITLE_MAX_LENGTH)).toBe(
            true,
        );
    });

    it("shortens commercial suffix for very long names", () => {
        const name = "X".repeat(55);
        const title = buildAutomaticProductMetaTitle(name, null);
        expect(title.length).toBeLessThanOrEqual(PRODUCT_META_TITLE_MAX_LENGTH);
        expect(title.startsWith("X")).toBe(true);
    });
});

describe("buildProductMetaTitle", () => {
    it("uses manual override when seo_title differs from display name", () => {
        expect(
            buildProductMetaTitle({
                name: "Sauvage",
                brand: { name: "Dior" },
                seo_title: "Dior Sauvage оригинал",
                price_range: { min: "199.00" },
            }),
        ).toBe("Dior Sauvage оригинал");
    });

    it("builds template when seo_title equals display name", () => {
        expect(
            buildProductMetaTitle({
                name: "Sauvage",
                brand: { name: "Dior" },
                seo_title: "Dior Sauvage",
                price_range: { min: null },
            }),
        ).toBe("Dior Sauvage купить в Минске и Беларуси");
    });

    it("builds template when seo_title is empty", () => {
        expect(
            buildProductMetaTitle({
                name: "Sauvage",
                brand: { name: "Dior" },
                seo_title: null,
            }),
        ).toBe("Dior Sauvage купить в Минске и Беларуси");
    });
});
