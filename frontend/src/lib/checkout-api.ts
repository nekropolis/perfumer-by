import { getAuthToken } from "@/lib/auth-token";
import { getCartToken } from "@/lib/cart-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type CheckoutPayload = {
    customer_name?: string;
    phone: string;
    comment?: string;
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
        total: string;
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

export async function createOrder(
    payload: CheckoutPayload
): Promise<CheckoutResponse> {
    const cartToken = typeof window !== "undefined" ? getCartToken() : "";
    const authToken = typeof window !== "undefined" ? getAuthToken() : "";

    const res = await fetch(`${API_BASE}/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": cartToken,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Checkout API error: ${res.status}`);
    }

    return res.json();
}