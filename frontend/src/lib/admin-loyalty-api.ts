import { getAuthToken } from "@/lib/auth-token";

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

export type GiftCertificateItem = {
    id: number;
    template_id?: number | null;
    code: string;
    number: string;
    initial_amount: string;
    balance_amount: string;
    reserved_amount: string;
    status: string;
    source?: string | null;
    expires_at: string | null;
    issued_to_user_id?: number | null;
    issued_phone?: string | null;
    comment?: string | null;
    issued_at?: string | null;
    activated_at?: string | null;
    purchaser_user_id?: number | null;
    sold_order_id?: number | null;
};

export type GiftCertificateTemplateItem = {
    id: number;
    title: string;
    amount: string;
    is_active: boolean;
};

export function giftCertificateStatusLabel(status: string): string {
    if (status === "active") return "Активен";
    if (status === "used") return "Использован";
    if (status === "redeemed") return "Погашен";
    if (status === "void") return "Аннулирован";
    if (status === "expired") return "Истёк";
    return status;
}

export type LoyaltyCardItem = {
    id: number;
    card_number?: string;
    number?: string;
    discount_percent: string;
    spent_total: string;
    status?: string;
    is_active?: boolean;
    users?: { id: number; name: string | null; phone: string | null }[];
};

export function loyaltyCardDisplayNumber(item: LoyaltyCardItem): string {
    return item.card_number ?? item.number ?? "";
}

export function loyaltyCardStatusLabel(item: LoyaltyCardItem): string {
    const s = item.status ?? (item.is_active ? "active" : "blocked");
    if (s === "active") return "Активна";
    if (s === "expired") return "Истекла";
    if (s === "blocked") return "Заблокирована";
    return s;
}

type LaravelPaginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
};

export async function fetchAdminGiftCertificates(params?: { search?: string; page?: number }): Promise<LaravelPaginated<GiftCertificateItem>> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));

    const res = await fetch(`${API_BASE}/admin/loyalty/gift-certificates${searchParams.toString() ? `?${searchParams}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) throw new Error(`Gift certificates API error: ${res.status}`);
    return res.json();
}

export async function fetchGiftCertificateTemplates(): Promise<{ data: GiftCertificateTemplateItem[] }> {
    const res = await fetch(`${API_BASE}/admin/loyalty/gift-certificate-templates`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gift certificate templates API error: ${res.status}`);
    return res.json();
}

export async function createGiftCertificate(payload: {
    template_id?: number | null;
    initial_amount?: number;
    source?: string;
    expires_at?: string | null;
    issued_to_user_id?: number | null;
    issued_phone?: string | null;
    comment?: string | null;
    issued_at?: string | null;
    activated_at?: string | null;
    sold_order_id?: number | null;
    purchaser_user_id?: number | null;
}) {
    const res = await fetch(`${API_BASE}/admin/loyalty/gift-certificates`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Create gift certificate API error: ${res.status}`);
    return res.json();
}

export async function fetchAdminGiftCertificate(id: number): Promise<{ data: GiftCertificateItem }> {
    const res = await fetch(`${API_BASE}/admin/loyalty/gift-certificates/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gift certificate API error: ${res.status}`);
    return res.json();
}

export async function updateGiftCertificate(
    id: number,
    payload: {
        template_id?: number | null;
        initial_amount?: number;
        balance_amount?: number;
        reserved_amount?: number;
        status?: string;
        source?: string;
        expires_at?: string | null;
        issued_to_user_id?: number | null;
        issued_phone?: string | null;
        comment?: string | null;
        issued_at?: string | null;
        activated_at?: string | null;
        purchaser_user_id?: number | null;
        sold_order_id?: number | null;
    },
) {
    const res = await fetch(`${API_BASE}/admin/loyalty/gift-certificates/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Update gift certificate API error: ${res.status}`);
    return res.json();
}

export async function fetchAdminLoyaltyCards(params?: { search?: string; page?: number }): Promise<LaravelPaginated<LoyaltyCardItem>> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));

    const res = await fetch(`${API_BASE}/admin/loyalty/cards${searchParams.toString() ? `?${searchParams}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) throw new Error(`Loyalty cards API error: ${res.status}`);
    return res.json();
}

export async function createLoyaltyCard(payload: {
    card_number?: string;
    number?: string;
    discount_percent?: number;
    status?: "active" | "blocked" | "expired";
}) {
    const res = await fetch(`${API_BASE}/admin/loyalty/cards`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Create loyalty card API error: ${res.status}`);
    return res.json();
}

export async function fetchAdminLoyaltyCard(id: number): Promise<{ data: LoyaltyCardItem }> {
    const res = await fetch(`${API_BASE}/admin/loyalty/cards/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Loyalty card API error: ${res.status}`);
    return res.json();
}

export async function updateLoyaltyCard(
    id: number,
    payload: { discount_percent?: number; status?: "active" | "blocked" | "expired"; issued_at?: string; owner_name?: string; phone?: string; notes?: string }
) {
    const res = await fetch(`${API_BASE}/admin/loyalty/cards/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Update loyalty card API error: ${res.status}`);
    return res.json();
}

export async function attachUserToLoyaltyCard(id: number, userId: number) {
    const res = await fetch(`${API_BASE}/admin/loyalty/cards/${id}/attach-user`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ user_id: userId }),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Attach user API error: ${res.status}`);
    return res.json();
}

export async function detachUserFromLoyaltyCard(cardId: number, userId: number) {
    const res = await fetch(`${API_BASE}/admin/loyalty/cards/${cardId}/users/${userId}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text() || `Detach user API error: ${res.status}`);
    return res.json();
}

export async function fetchLoyaltyCardsReport(params?: { from?: string; to?: string; page?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set("from", params.from);
    if (params?.to) searchParams.set("to", params.to);
    if (params?.page) searchParams.set("page", String(params.page));
    const res = await fetch(`${API_BASE}/admin/loyalty/reports/cards${searchParams.toString() ? `?${searchParams}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Loyalty report API error: ${res.status}`);
    return res.json() as Promise<{
        cards: LaravelPaginated<LoyaltyCardItem & { purchases_count: number; subtotal_sum: string | null }>;
        meta: { orders_with_cards: number };
    }>;
}

