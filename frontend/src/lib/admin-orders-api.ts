import { getAuthToken } from "@/lib/auth-token";
import type { OrderResponse, OrdersResponse } from "@/types/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function fetchOrders(params?: {
    search?: string;
    status?: string;
}): Promise<OrdersResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.status) {
        searchParams.set("status", params.status);
    }

    const query = searchParams.toString();
    const url = `${API_BASE}/admin/orders${query ? `?${query}` : ""}`;

    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Orders API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchOrder(id: number): Promise<OrderResponse> {
    const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
        headers: getAdminHeaders(),
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
        headers: getAdminHeaders(),
        body: JSON.stringify({ status }),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Order status API error: ${res.status}`);
    }

    return res.json();
}