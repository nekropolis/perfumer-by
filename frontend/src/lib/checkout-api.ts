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

export async function createOrder(payload: CheckoutPayload) {
    const token = typeof window !== "undefined" ? getCartToken() : "";

    const res = await fetch(`${API_BASE}/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Cart-Token": token,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Checkout API error: ${res.status}`);
    }

    return res.json();
}