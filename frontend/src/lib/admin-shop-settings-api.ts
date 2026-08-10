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

export type ShopContactSettings = {
    contact_phone_mts: string;
    contact_phone_a1: string;
    contact_phone_life: string;
    contact_email: string;
    legal_name: string;
    legal_unp: string;
    legal_address: string;
    contact_telegram_url: string;
    contact_viber_url: string;
    waiting_discount_delivery_date: string;
};

export type ShopBrandOption = {
    id: number;
    name: string;
    slug: string;
};

export type ShopSettings = ShopDeliverySettings &
    ShopContactSettings & {
        home_popular_brands: ShopBrandOption[];
        search_popular_brands: ShopBrandOption[];
        filter_popular_brands: ShopBrandOption[];
    };

export type ShopSettingsUpdatePayload = Partial<ShopDeliverySettings & ShopContactSettings> & {
    home_popular_brand_ids?: number[];
    search_popular_brand_ids?: number[];
    filter_popular_brand_ids?: number[];
};

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function fetchAdminShopDeliverySettings(): Promise<{ data: ShopSettings }> {
    const res = await fetch(`${API_BASE}/admin/shop-settings`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Shop settings API error: ${res.status}`);
    return res.json();
}

export async function updateAdminShopDeliverySettings(
    payload: ShopSettingsUpdatePayload
): Promise<{ data: ShopSettings }> {
    const res = await fetch(`${API_BASE}/admin/shop-settings`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error((await res.text()) || `Shop settings update error: ${res.status}`);
    return res.json();
}
