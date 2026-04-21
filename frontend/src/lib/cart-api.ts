import { getCartToken } from "@/lib/cart-token";
import type { CartResponse } from "@/types/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

async function cartFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== "undefined" ? getCartToken() : "";

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": token,
            ...(options?.headers || {}),
        },
        cache: "no-store",
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Cart API error: ${res.status}${errorText ? ` - ${errorText}` : ""}`);
    }

    return res.json();
}

export async function fetchCart(): Promise<CartResponse> {
    return cartFetch<CartResponse>("/cart");
}

export async function addToCart(variantId: number, qty = 1): Promise<CartResponse> {
    return cartFetch<CartResponse>("/cart/items", {
        method: "POST",
        body: JSON.stringify({
            variant_id: variantId,
            qty,
        }),
    });
}

export async function updateCartItem(itemId: number, qty: number): Promise<CartResponse> {
    return cartFetch<CartResponse>(`/cart/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ qty }),
    });
}

export async function removeCartItem(itemId: number): Promise<CartResponse> {
    return cartFetch<CartResponse>(`/cart/items/${itemId}`, {
        method: "DELETE",
    });
}
