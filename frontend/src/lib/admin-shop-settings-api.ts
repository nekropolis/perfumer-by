import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type ShopDeliverySettings = {
    delivery_minsk_free_threshold: number;
    delivery_minsk_fee: number;
    delivery_belarus_fee: number;
    delivery_belarus_free_min_lines: number;
};

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function fetchAdminShopDeliverySettings(): Promise<{ data: ShopDeliverySettings }> {
    const res = await fetch(`${API_BASE}/admin/shop-settings`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Shop settings API error: ${res.status}`);
    return res.json();
}

export async function updateAdminShopDeliverySettings(payload: Partial<ShopDeliverySettings>): Promise<{ data: ShopDeliverySettings }> {
    const res = await fetch(`${API_BASE}/admin/shop-settings`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Shop settings update error: ${res.status}`);
    return res.json();
}
