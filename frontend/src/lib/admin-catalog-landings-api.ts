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

export type AdminCatalogLandingItem = {
    id: number;
    slug: string;
    gender?: string | null;
    filters?: Record<string, number[]> | null;
    h1: string;
    seo_title: string;
    seo_description?: string | null;
    content?: string | null;
    is_active: boolean;
    sort: number;
    updated_at?: string | null;
};

export type AdminCatalogLandingsResponse = {
    data: AdminCatalogLandingItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type AdminCatalogLandingDetailResponse = {
    data: AdminCatalogLandingItem;
};

export async function fetchAdminCatalogLandings(params?: {
    search?: string;
    page?: number;
}): Promise<AdminCatalogLandingsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/catalog-landings${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Catalog landings API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminCatalogLandingById(
    id: number | string,
): Promise<AdminCatalogLandingDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/catalog-landings/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Catalog landing detail API error: ${res.status}`);
    }

    return res.json();
}

export async function createAdminCatalogLanding(payload: Record<string, unknown>): Promise<AdminCatalogLandingDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/catalog-landings`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create catalog landing error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminCatalogLanding(
    id: number | string,
    payload: Record<string, unknown>,
): Promise<AdminCatalogLandingDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/catalog-landings/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update catalog landing error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAdminCatalogLanding(id: number | string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/catalog-landings/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete catalog landing error: ${res.status}`);
    }
}
