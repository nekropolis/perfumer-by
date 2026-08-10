import { describe, expect, it } from "vitest";
import {
    PRODUCT_META_TITLE_MAX_LENGTH,
    buildAutomaticProductMetaTitle,
    buildProductMetaDescription,
    buildProductMetaTitle,
    hasManualProductSeoTitle,
} from "./product-page-seo";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";

function makeVariant(overrides: Partial<ProductVariantData> & Pick<ProductVariantData, "id">): ProductVariantData {
    return {
        volume: 50,
        volume_unit: "мл",
        type: "парфюмерная вода",
        concentration: "edp",
        edition: null,
        display_name: "50 мл / EDP",
        price: "100.00",
        old_price: null,
        waiting_price: null,
        waiting_discount_percent: null,
        discount_percent: null,
        stock: 1,
        available_stock: 1,
        is_preorder: false,
        is_available: true,
        is_promotion: false,
        availability_source: "main",
        ...overrides,
    };
}

function makeProduct(overrides: Partial<ProductDetailData> = {}): ProductDetailData {
    return {
        id: 1,
        is_active: true,
        is_new: false,
        is_hit: false,
        is_set: false,
        is_out_of_stock: false,
        name: "Alive Eau de Parfum",
        display_name: "Hugo Boss Alive Eau de Parfum",
        slug: "hugo-boss-boss-alive",
        h1: null,
        short_description: null,
        description: null,
        seo_title: null,
        seo_description: null,
        brand: { id: 1, name: "Hugo Boss", slug: "hugo-boss" },
        images: [],
        attribute_values: [],
        price_range: { min: "19.40", max: "390.10" },
        stock_total: 1,
        variants: [],
        default_variant_id: null,
        ...overrides,
    };
}

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

describe("buildProductMetaDescription", () => {
    it("prefers manual seo_description", () => {
        const description = buildProductMetaDescription(
            makeProduct({
                seo_description: "Ручное описание для сниппета.",
            }),
        );
        expect(description).toBe("Ручное описание для сниппета.");
    });

    it("includes unique volumes and concentrations for mixed variants", () => {
        const description = buildProductMetaDescription(
            makeProduct({
                variants: [
                    makeVariant({
                        id: 1,
                        volume: 30,
                        type: "парфюмерная вода",
                        concentration: "edp",
                    }),
                    makeVariant({
                        id: 2,
                        volume: 50,
                        type: "духи",
                        concentration: "parfum",
                    }),
                    makeVariant({
                        id: 3,
                        volume: 50,
                        type: "духи",
                        concentration: "parfum",
                    }),
                    makeVariant({
                        id: 4,
                        volume: 80,
                        type: "туалетная вода",
                        concentration: "edt",
                    }),
                ],
            }),
        );

        expect(description).toContain("30 мл, 50 мл, 80 мл");
        expect(description).toContain("парфюмерная вода");
        expect(description).toContain("духи");
        expect(description).toContain("туалетная вода");
        expect(description).toContain("Цена от 19.40 BYN");
        expect(description.length).toBeLessThanOrEqual(161);
    });

    it("falls back to concentration codes when type is empty", () => {
        const description = buildProductMetaDescription(
            makeProduct({
                variants: [
                    makeVariant({
                        id: 1,
                        volume: 50,
                        type: null,
                        concentration: "edp",
                    }),
                    makeVariant({
                        id: 2,
                        volume: 100,
                        type: null,
                        concentration: "parfum",
                    }),
                ],
            }),
        );

        expect(description).toContain("50 мл, 100 мл");
        expect(description).toContain("EDP");
        expect(description).toContain("PARFUM");
    });
});
