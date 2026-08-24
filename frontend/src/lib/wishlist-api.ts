import { getAuthToken } from "@/lib/auth-token";
import type { ProductListItem } from "@/types/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type WishlistResponse = {
    data: ProductListItem[];
    meta?: {
        qty?: number;
    };
};

function authHeaders(): HeadersInit {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function wishlistFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
        },
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Wishlist API error: ${res.status}${text ? ` - ${text}` : ""}`);
    }

    return res.json();
}

export async function fetchWishlist(): Promise<WishlistResponse> {
    return wishlistFetch<WishlistResponse>("/wishlist", {
        method: "GET",
        headers: authHeaders(),
    });
}

export async function addWishlistItem(productId: number): Promise<WishlistResponse> {
    return wishlistFetch<WishlistResponse>("/wishlist/items", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ product_id: productId }),
    });
}

export async function removeWishlistItem(productId: number): Promise<WishlistResponse> {
    return wishlistFetch<WishlistResponse>(`/wishlist/items/${productId}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}

export async function syncWishlistItems(productIds: number[]): Promise<WishlistResponse> {
    return wishlistFetch<WishlistResponse>("/wishlist/sync", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ product_ids: productIds }),
    });
}

export async function previewWishlist(productIds: number[]): Promise<WishlistResponse> {
    return wishlistFetch<WishlistResponse>("/wishlist/preview", {
        method: "POST",
        body: JSON.stringify({ product_ids: productIds }),
    });
}

export function trackGuestWishlist(productIds: number[]): void {
    const ids = productIds.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
        return;
    }

    const token = typeof window !== "undefined" ? getAuthToken() : "";

    void fetch(`${API_BASE}/wishlist/track`, {
        method: "POST",
        keepalive: true,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ product_ids: ids }),
    }).catch(() => {});
}
