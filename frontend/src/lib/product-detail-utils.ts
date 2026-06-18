import type { ProductImageData, ProductVariantData } from "@/types/catalog";
import { formatMoneyDisplay } from "@/lib/format-money-display";

export const SIMILAR_PRODUCTS_MIN_TO_SHOW = 4;
export const SIMILAR_GAP_PX = 12;

export function formatProductDetailPrice(price: string | null): string {
    if (!price) {
        return "—";
    }
    const v = formatMoneyDisplay(price);
    return v ? `${v} BYN` : "—";
}

export function normalizeProductImages(value: unknown): ProductImageData[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is ProductImageData => Boolean(item && typeof item === "object"));
    }

    if (value && typeof value === "object") {
        return Object.values(value).filter((item): item is ProductImageData => Boolean(item && typeof item === "object"));
    }

    return [];
}

export function normalizeProductVariants(value: unknown): ProductVariantData[] {
    const normalizeList = (items: unknown[]): ProductVariantData[] => {
        const byId = new Map<number, ProductVariantData>();
        for (const raw of items) {
            if (!raw || typeof raw !== "object") {
                continue;
            }
            const candidate = raw as Partial<ProductVariantData>;
            const id = Number(candidate.id);
            if (!Number.isFinite(id) || id <= 0) {
                continue;
            }
            byId.set(id, { ...candidate, id } as ProductVariantData);
        }
        return Array.from(byId.values());
    };

    if (Array.isArray(value)) {
        return normalizeList(value);
    }

    if (value && typeof value === "object") {
        return normalizeList(Object.values(value));
    }

    return [];
}

export function similarVisibleColumns(): 2 | 3 | 4 {
    if (typeof window === "undefined") {
        return 2;
    }
    if (window.matchMedia("(min-width: 1280px)").matches) {
        return 4;
    }
    if (window.matchMedia("(min-width: 768px)").matches) {
        return 3;
    }
    return 2;
}
