import { describe, expect, it } from "vitest";
import { homeStoreJsonLd, productJsonLd } from "./json-ld";
import type { ReviewItem } from "@/types/reviews";
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
        waiting_price: "97.00",
        waiting_discount_percent: 3,
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
        id: 13158,
        is_active: true,
        is_new: false,
        is_hit: false,
        is_set: false,
        is_out_of_stock: false,
        name: "Alive Eau de Parfum",
        display_name: "Hugo Boss Alive Eau de Parfum",
        slug: "hugo-boss-boss-alive",
        h1: "Hugo Boss Alive Eau de Parfum",
        short_description: null,
        description: "<b>Hugo Boss Alive</b>&nbsp;100% оригинал.",
        seo_title: null,
        seo_description: null,
        brand: { id: 297, name: "Hugo Boss", slug: "hugo-boss" },
        images: [],
        attribute_values: [],
        price_range: { min: "19.40", max: "390.10" },
        stock_total: 10,
        variants: [],
        default_variant_id: null,
        ...overrides,
    };
}

describe("productJsonLd", () => {
    it("uses catalog price for main stock and waiting_price for supplier_only", () => {
        const product = makeProduct({
            variants: [
                makeVariant({
                    id: 1,
                    display_name: "50 мл / EDP",
                    price: "100.00",
                    waiting_price: "97.00",
                    availability_source: "main",
                }),
                makeVariant({
                    id: 2,
                    display_name: "30 мл / EDP",
                    price: "19.40",
                    waiting_price: "18.80",
                    availability_source: "supplier_only",
                }),
            ],
        });

        const ld = productJsonLd(product);
        const offers = ld.offers as Array<Record<string, unknown>>;

        expect(offers).toHaveLength(2);
        expect(offers[0]?.price).toBe("100.00");
        expect(offers[1]?.price).toBe("18.80");
    });

    it("does not apply waiting price to promotions even if supplier_only", () => {
        const product = makeProduct({
            variants: [
                makeVariant({
                    id: 3,
                    price: "200.00",
                    waiting_price: "194.00",
                    is_promotion: true,
                    availability_source: "supplier_only",
                }),
            ],
        });

        const ld = productJsonLd(product);
        const offer = ld.offers as Record<string, unknown>;
        expect(offer.price).toBe("200.00");
    });

    it("falls back to computed waiting discount when waiting_price is missing", () => {
        const product = makeProduct({
            variants: [
                makeVariant({
                    id: 4,
                    price: "19.40",
                    waiting_price: null,
                    availability_source: "supplier_only",
                }),
            ],
        });

        const ld = productJsonLd(product);
        const offer = ld.offers as Record<string, unknown>;
        expect(offer.price).toBe("18.80");
    });

    it("keeps distinct offer names for mixed concentrations", () => {
        const product = makeProduct({
            variants: [
                makeVariant({
                    id: 5,
                    display_name: "50 мл / EDP",
                    type: "парфюмерная вода",
                    concentration: "edp",
                }),
                makeVariant({
                    id: 6,
                    display_name: "50 мл / PARFUM",
                    type: "духи",
                    concentration: "parfum",
                }),
            ],
        });

        const ld = productJsonLd(product);
        const offers = ld.offers as Array<Record<string, unknown>>;
        const names = offers.map((o) => o.name);

        expect(names).toEqual([
            "Hugo Boss Alive Eau de Parfum 50 мл / EDP",
            "Hugo Boss Alive Eau de Parfum 50 мл / PARFUM",
        ]);
    });

    it("strips HTML and &nbsp; from product description", () => {
        const ld = productJsonLd(
            makeProduct({
                description: "<b>Hugo Boss Alive</b>&nbsp;100% оригинал.",
            }),
        );

        expect(ld.description).toBe("Hugo Boss Alive 100% оригинал.");
        expect(String(ld.description)).not.toContain("&nbsp;");
        expect(String(ld.description)).not.toContain("<b>");
    });
});

function makeReview(id: number, stars: number): ReviewItem {
    return {
        id,
        type: "product",
        product_id: 1,
        name: `Покупатель ${id}`,
        text: "Хороший аромат, рекомендую.",
        stars,
        created_at: "2026-01-01T10:00:00+00:00",
        published_at: "2026-01-01T10:00:00+00:00",
    };
}

describe("productJsonLd aggregateRating", () => {
    const reviews = [makeReview(1, 5), makeReview(2, 3)];

    it("falls back to loaded reviews when meta is absent", () => {
        const ld = productJsonLd(makeProduct(), reviews);
        const rating = ld.aggregateRating as Record<string, unknown>;
        expect(rating.reviewCount).toBe(2);
        expect(rating.ratingValue).toBe(4);
    });

    it("uses backend meta totals when available", () => {
        const ld = productJsonLd(makeProduct(), reviews, { total: 120, average: 4.67 });
        const rating = ld.aggregateRating as Record<string, unknown>;
        expect(rating.reviewCount).toBe(120);
        expect(rating.ratingValue).toBe(4.7);
        expect(ld.review).toHaveLength(2);
    });

    it("ignores inconsistent meta", () => {
        const ld = productJsonLd(makeProduct(), reviews, { total: 1, average: 5 });
        const rating = ld.aggregateRating as Record<string, unknown>;
        expect(rating.reviewCount).toBe(2);
        expect(rating.ratingValue).toBe(4);
    });

    it("omits rating without reviews", () => {
        const ld = productJsonLd(makeProduct(), [], { total: 0, average: null });
        expect(ld.aggregateRating).toBeUndefined();
    });
});

describe("productJsonLd offers without variants", () => {
    it("does not claim offerCount for a price range", () => {
        const ld = productJsonLd(
            makeProduct({ variants: [], price_range: { min: "10.00", max: "20.00" } }),
        );
        const offers = ld.offers as Record<string, unknown>;
        expect(offers["@type"]).toBe("AggregateOffer");
        expect(offers.lowPrice).toBe("10.00");
        expect(offers.highPrice).toBe("20.00");
        expect(offers).not.toHaveProperty("offerCount");
    });
});

describe("homeStoreJsonLd aggregateRating", () => {
    const snippets = [{ id: 1, name: "А", text: "Отлично", rating: 5, date: "1 января 2026" }];

    it("is omitted without full stats", () => {
        expect(homeStoreJsonLd(snippets).aggregateRating).toBeUndefined();
    });

    it("uses full stats", () => {
        const ld = homeStoreJsonLd(snippets, { stats: { total: 340, average: 4.86 } });
        expect(ld.aggregateRating).toMatchObject({ ratingValue: "4.9", reviewCount: "340" });
    });
});
