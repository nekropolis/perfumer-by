import { getAuthToken } from "@/lib/auth-token";
import type { OrderResponse, OrdersResponse } from "@/types/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAuthHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function fetchMyOrders(): Promise<OrdersResponse> {
    const res = await fetch(`${API_BASE}/orders/my`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`My orders API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchMyOrder(id: number): Promise<OrderResponse> {
    const res = await fetch(`${API_BASE}/orders/my/${id}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`My order API error: ${res.status}`);
    }

    return res.json();
}