import { getAuthToken } from "@/lib/auth-token";
import { getCartToken } from "@/lib/cart-token";
import { fetchSiteContent } from "@/lib/site-content-api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type CheckoutDeliveryMethod = "minsk_courier" | "belarus_courier" | "pickup";

export type CheckoutPaymentMethod = "cash" | "card";

export type CheckoutPayload = {
    customer_name?: string;
    phone: string;
    /** Режим «Международный номер»: любые 8–15 цифр с кодом страны, без проверки оператора BY. */
    phone_plain_digits?: boolean;
    comment?: string;
    delivery_method: CheckoutDeliveryMethod;
    delivery_city?: string | null;
    delivery_address: string;
    payment_method: CheckoutPaymentMethod;
    /** Частичное оформление: id строк `cart_items` в корзине; вместе с `gift_certificate_cart_item_ids` заменяет полную корзину. */
    cart_item_ids?: number[];
    gift_certificate_cart_item_ids?: number[];
};

/** Выбор строк на корзине для частичного чекаута (sessionStorage). */
export const CHECKOUT_LINE_SELECTION_STORAGE_KEY = "perfumer:checkout:lineSelection";

export type CheckoutLineSelectionStored = {
    cart_item_ids: number[];
    gift_certificate_cart_item_ids: number[];
};

export type CheckoutShopSettings = {
    delivery_minsk_free_threshold: number;
    delivery_minsk_fee: number;
    delivery_belarus_fee: number;
    delivery_belarus_free_min_lines: number;
};

/** Ответ `GET /checkout/cities` (справочник `Settlement` на бэкенде). */
export type CheckoutCityHit = {
    id: number;
    name: string;
    name_ru: string | null;
    name_be: string | null;
    name_en: string | null;
    full_name: string;
    type: string;
    place: string | null;
    name_prefix: string | null;
    region_name: string | null;
    district_name: string | null;
    subdistrict_name: string | null;
    postcode: string | null;
    latitude: number | null;
    longitude: number | null;
};

export type CheckoutQuote = {
    subtotal: string;
    gift_certificates_purchase_subtotal?: string;
    loyalty_discount_percent: string;
    loyalty_discount_amount: string;
    gift_certificate_amount: string;
    delivery_fee: string;
    total: string;
};

export type CheckoutResponse = {
    data: {
        id: number;
        customer_name: string | null;
        phone: string;
        comment: string | null;
        status: string;
        items_qty: number;
        subtotal: string;
        delivery_method?: string | null;
        delivery_method_label?: string | null;
        delivery_city?: string | null;
        delivery_address?: string | null;
        delivery_fee?: string;
        payment_method?: string | null;
        payment_method_label?: string | null;
        total: string;
        gift_certificate_code: string | null;
        gift_certificate_number: string | null;
        gift_certificate_amount: string;
        gift_certificates?: { code: string; amount_applied: string }[];
        discount_card_number: string | null;
        discount_percent_snapshot: string;
        discount_amount: string;
        items: {
            id: number;
            product_name: string;
            product_slug: string | null;
            brand_name: string | null;
            variant_title: string;
            sku: string | null;
            qty: number;
            price: string;
            total: string;
        }[];
    };
    message: string;
};

export async function fetchCheckoutShopSettings(): Promise<{ data: CheckoutShopSettings }> {
    const res = await fetchSiteContent();
    return {
        data: {
            delivery_minsk_free_threshold: res.data.delivery_minsk_free_threshold,
            delivery_minsk_fee: res.data.delivery_minsk_fee,
            delivery_belarus_fee: res.data.delivery_belarus_fee,
            delivery_belarus_free_min_lines: res.data.delivery_belarus_free_min_lines,
        },
    };
}

export async function searchCheckoutCities(query: string): Promise<{ data: CheckoutCityHit[] }> {
    const q = query.trim();
    if (q.length < 2) return { data: [] };
    const res = await fetch(`${API_BASE}/checkout/cities?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Checkout cities error: ${res.status}`);
    const body = (await res.json()) as { data?: CheckoutCityHit[] };
    return { data: Array.isArray(body.data) ? body.data : [] };
}

export async function fetchCheckoutQuote(payload: {
    payment_method: CheckoutPaymentMethod;
    delivery_method: CheckoutDeliveryMethod;
    cart_item_ids?: number[];
    gift_certificate_cart_item_ids?: number[];
}): Promise<{ data: CheckoutQuote }> {
    const cartToken = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";
    const res = await fetch(`${API_BASE}/checkout/quote`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": cartToken,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ ...payload, cart_token: cartToken || undefined }),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Checkout quote error: ${res.status}`);
    return res.json();
}

function parseCheckoutErrorMessage(status: number, raw: string): string {
    const fallback = `Ошибка оформления заказа (${status})`;
    if (!raw.trim()) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(raw) as {
            message?: string;
            errors?: Record<string, string[] | string>;
        };
        if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
            return parsed.message.trim();
        }
        if (parsed.errors && typeof parsed.errors === "object") {
            const parts: string[] = [];
            for (const v of Object.values(parsed.errors)) {
                if (Array.isArray(v)) {
                    for (const s of v) {
                        if (typeof s === "string" && s.trim() !== "") {
                            parts.push(s.trim());
                        }
                    }
                } else if (typeof v === "string" && v.trim() !== "") {
                    parts.push(v.trim());
                }
            }
            if (parts.length > 0) {
                return parts.join(" ");
            }
        }
    } catch {
        const preview = raw.replace(/\s+/g, " ").trim().slice(0, 200);
        if (preview) {
            return preview;
        }
    }
    return fallback;
}

export async function createOrder(payload: CheckoutPayload): Promise<CheckoutResponse> {
    const cartToken = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";

    const res = await fetch(`${API_BASE}/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Cart-Token": cartToken,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    const raw = await res.text();
    if (!res.ok) {
        throw new Error(parseCheckoutErrorMessage(res.status, raw));
    }

    return JSON.parse(raw) as CheckoutResponse;
}
