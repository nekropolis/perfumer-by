import { getAuthToken } from "@/lib/auth-token";
import { getCartToken } from "@/lib/cart-token";
import type { CartResponse } from "@/types/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export class DiscountCardApplyError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "DiscountCardApplyError";
        this.status = status;
        this.code = code;
    }
}

export class GiftCertificateApplyError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "GiftCertificateApplyError";
        this.status = status;
    }
}

export function normalizeGiftCertificateDigits(input: string): string {
    return input.replace(/\D/g, "").slice(0, 4);
}

export function toGiftCertificateCode(digits: string): string {
    return `PBY-${normalizeGiftCertificateDigits(digits)}`;
}

function extractApiMessage(text: string, fallback: string): string {
    if (!text) return fallback;
    try {
        const payload = JSON.parse(text);
        if (payload?.message && typeof payload.message === "string") {
            return payload.message;
        }
    } catch {
        /* ignore */
    }

    const looksLikeHtml = /<[^>]+>/.test(text);
    if (looksLikeHtml) {
        return fallback;
    }

    return text;
}

async function cartFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": token,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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

export async function applyGiftCertificate(code: string): Promise<CartResponse> {
    const token = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";
    const trimmed = code.trim();
    const res = await fetch(`${API_BASE}/cart/gift-certificate/apply`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": token,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ code: trimmed, number: trimmed }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        const message = extractApiMessage(text, "Не удалось применить сертификат");
        throw new GiftCertificateApplyError(message, res.status);
    }

    return res.json();
}

export async function clearGiftCertificate(): Promise<CartResponse> {
    return cartFetch<CartResponse>("/cart/gift-certificate", {
        method: "DELETE",
    });
}

export async function applyDiscountCard(number: string, sessionOnly = false): Promise<CartResponse> {
    const token = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";

    const res = await fetch(`${API_BASE}/cart/discount-card/apply`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": token,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ number: number.trim(), session_only: sessionOnly }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        let code: string | undefined;
        let message = extractApiMessage(text, "Не удалось применить скидочную карту");
        try {
            const payload = text ? JSON.parse(text) : null;
            if (payload?.code) {
                code = String(payload.code);
            }
        } catch {
            /* ignore */
        }
        throw new DiscountCardApplyError(message, res.status, code);
    }

    return res.json();
}

export async function clearDiscountCard(): Promise<CartResponse> {
    return cartFetch<CartResponse>("/cart/discount-card", {
        method: "DELETE",
    });
}

export type GiftCertificateTemplatePublic = {
    id: number;
    title: string;
    amount: string;
    is_active: boolean;
};

export async function fetchGiftCertificateTemplates() {
    return cartFetch<{ data: GiftCertificateTemplatePublic[] }>("/cart/gift-certificate-templates");
}

export async function addGiftCertificateTemplateToCart(templateId: number, qty = 1): Promise<CartResponse> {
    return cartFetch<CartResponse>("/cart/gift-certificate-items", {
        method: "POST",
        body: JSON.stringify({
            template_id: templateId,
            qty,
        }),
    });
}

export async function updateGiftCertificateTemplateCartItem(itemId: number, qty: number): Promise<CartResponse> {
    return cartFetch<CartResponse>(`/cart/gift-certificate-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ qty }),
    });
}

export async function removeGiftCertificateTemplateCartItem(itemId: number): Promise<CartResponse> {
    return cartFetch<CartResponse>(`/cart/gift-certificate-items/${itemId}`, {
        method: "DELETE",
    });
}
