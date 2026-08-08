import { describe, expect, it, vi } from "vitest";
import type {
    ProductSeoField,
    ProductSeoFieldState,
    ProductSeoGeneration,
} from "./admin-products-api";
import {
    defaultProductSeoFields,
    hasManualProductSeoFields,
    pollProductSeoGeneration,
} from "./product-seo-polling";

const order: ProductSeoField[] = [
    "seo_description",
    "short_description",
    "description",
];

function generation(
    status: ProductSeoGeneration["status"],
    id = 1,
): ProductSeoGeneration {
    return {
        id,
        product_id: 10,
        status,
        external_status: status === "polling" ? "generating" : null,
        requested_fields: order,
        result: null,
        request_payload: {},
        raw_result: null,
        error: null,
        conflict: status === "conflicted",
        attempts: 1,
        created_at: null,
        finished_at: null,
    };
}

describe("product SEO field selection", () => {
    const fields = {
        seo_description: { state: "new", current: null },
        short_description: { state: "new", current: null },
        description: { state: "generated", current: "<p>Text</p>" },
    } satisfies Record<ProductSeoField, ProductSeoFieldState>;

    it("selects only fields that have never been generated", () => {
        expect(defaultProductSeoFields(fields, order)).toEqual([
            "seo_description",
            "short_description",
        ]);
    });

    it("detects selected manual changes that need confirmation", () => {
        const withManual = {
            ...fields,
            seo_description: { state: "manually_changed", current: "Manual" },
        } satisfies Record<ProductSeoField, ProductSeoFieldState>;
        expect(hasManualProductSeoFields(["seo_description"], withManual)).toBe(true);
        expect(hasManualProductSeoFields(["short_description"], withManual)).toBe(false);
    });
});

describe("product SEO polling", () => {
    it("polls sequentially until completed", async () => {
        const fetchStatus = vi
            .fn<(signal: AbortSignal) => Promise<ProductSeoGeneration>>()
            .mockResolvedValueOnce(generation("polling"))
            .mockResolvedValueOnce({
                ...generation("completed"),
                result: { seo_description: "Generated" },
            });
        const onUpdate = vi.fn();

        const result = await pollProductSeoGeneration({
            fetchStatus,
            onUpdate,
            signal: new AbortController().signal,
            wait: async () => undefined,
        });

        expect(result?.status).toBe("completed");
        expect(fetchStatus).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenCalledTimes(2);
    });

    it.each(["failed", "conflicted"] as const)("stops on %s", async (status) => {
        const fetchStatus = vi.fn().mockResolvedValue(generation(status));

        const result = await pollProductSeoGeneration({
            fetchStatus,
            onUpdate: vi.fn(),
            signal: new AbortController().signal,
        });

        expect(result?.status).toBe(status);
        expect(fetchStatus).toHaveBeenCalledOnce();
    });

    it("stops cleanly when aborted during delay", async () => {
        const controller = new AbortController();
        const fetchStatus = vi.fn().mockResolvedValue(generation("polling"));

        const result = await pollProductSeoGeneration({
            fetchStatus,
            onUpdate: vi.fn(),
            signal: controller.signal,
            wait: async () => {
                controller.abort();
            },
        });

        expect(result).toBeNull();
        expect(fetchStatus).toHaveBeenCalledOnce();
    });
});
