import type { OrderResponse, OrdersResponse } from "@/types/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export async function fetchOrders(): Promise<OrdersResponse> {
    const res = await fetch(`${API_BASE}/admin/orders`, {
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Orders API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchOrder(id: number): Promise<OrderResponse> {
    const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Order API error: ${res.status}`);
    }

    return res.json();
}

export async function updateOrderStatus(
    id: number,
    status: string
): Promise<OrderResponse> {
    const res = await fetch(`${API_BASE}/admin/orders/${id}/status`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Order status API error: ${res.status}`);
    }

    return res.json();
}