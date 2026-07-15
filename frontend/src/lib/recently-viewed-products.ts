import { normalizeProductImages } from "@/lib/product-detail-utils";
import { productImagePathForContext } from "@/lib/product-image-url";
import type { ProductDetailData } from "@/types/catalog";

export const RECENTLY_VIEWED_STORAGE_KEY = "perfumer_recently_viewed_products";
export const RECENTLY_VIEWED_MAX_ITEMS = 12;

export type RecentlyViewedProduct = {
    id: number;
    slug: string;
    name: string;
    brand_name: string | null;
    image: string | null;
};

function isRecentlyViewedProduct(value: unknown): value is RecentlyViewedProduct {
    if (!value || typeof value !== "object") {
        return false;
    }

    const item = value as Partial<RecentlyViewedProduct>;
    return (
        Number.isInteger(item.id) &&
        (item.id ?? 0) > 0 &&
        typeof item.slug === "string" &&
        item.slug.trim().length > 0 &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        (item.brand_name === null || typeof item.brand_name === "string") &&
        (item.image === null || typeof item.image === "string")
    );
}

export function productDetailToRecentlyViewed(product: ProductDetailData): RecentlyViewedProduct {
    const images = normalizeProductImages(product.images);
    const mainImage = images.find((image) => image.is_main) || images[0] || null;

    return {
        id: product.id,
        slug: product.slug,
        name: product.name.trim(),
        brand_name: product.brand?.name?.trim() || null,
        image: mainImage ? productImagePathForContext(mainImage, "thumb") : null,
    };
}

export function readRecentlyViewedProducts(): RecentlyViewedProduct[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        const seen = new Set<number>();
        const items: RecentlyViewedProduct[] = [];

        for (const entry of parsed) {
            if (!isRecentlyViewedProduct(entry) || seen.has(entry.id)) {
                continue;
            }
            seen.add(entry.id);
            items.push(entry);
            if (items.length >= RECENTLY_VIEWED_MAX_ITEMS) {
                break;
            }
        }

        return items;
    } catch {
        return [];
    }
}

const recentlyViewedListeners = new Set<() => void>();
let recentlyViewedSnapshot: RecentlyViewedProduct[] = [];
let recentlyViewedSnapshotInitialized = false;

const RECENTLY_VIEWED_SERVER_SNAPSHOT: RecentlyViewedProduct[] = [];

export function getRecentlyViewedServerSnapshot(): RecentlyViewedProduct[] {
    return RECENTLY_VIEWED_SERVER_SNAPSHOT;
}

function refreshRecentlyViewedSnapshot(): RecentlyViewedProduct[] {
    recentlyViewedSnapshot = readRecentlyViewedProducts();
    return recentlyViewedSnapshot;
}

export function subscribeRecentlyViewed(onStoreChange: () => void): () => void {
    if (typeof window !== "undefined" && !recentlyViewedSnapshotInitialized) {
        recentlyViewedSnapshotInitialized = true;
        refreshRecentlyViewedSnapshot();
    }

    recentlyViewedListeners.add(onStoreChange);
    return () => recentlyViewedListeners.delete(onStoreChange);
}

export function getRecentlyViewedSnapshot(): RecentlyViewedProduct[] {
    if (typeof window === "undefined") {
        return RECENTLY_VIEWED_SERVER_SNAPSHOT;
    }
    if (!recentlyViewedSnapshotInitialized) {
        recentlyViewedSnapshotInitialized = true;
        return refreshRecentlyViewedSnapshot();
    }
    return recentlyViewedSnapshot;
}

function notifyRecentlyViewedListeners(): void {
    refreshRecentlyViewedSnapshot();
    recentlyViewedListeners.forEach((listener) => listener());
}

export function addRecentlyViewedProduct(item: RecentlyViewedProduct): RecentlyViewedProduct[] {
    const next = [item, ...readRecentlyViewedProducts().filter((entry) => entry.id !== item.id)].slice(
        0,
        RECENTLY_VIEWED_MAX_ITEMS,
    );

    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
            notifyRecentlyViewedListeners();
        } catch {
            // ignore localStorage write errors
        }
    }

    return next;
}
