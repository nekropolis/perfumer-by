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

export type AdminSeoRedirectItem = {
    id: number;
    from_path: string;
    to_path: string | null;
    http_code: number;
    is_active: boolean;
    source: string;
    legacy_entity_type: string | null;
    legacy_entity_id: number | null;
    note: string | null;
    hit_count: number;
    last_hit_at: string | null;
    created_at: string;
    updated_at: string;
};

export type AdminSeoRedirectsResponse = {
    data: AdminSeoRedirectItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export async function fetchAdminSeoRedirects(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    is_active?: "" | "1" | "0";
    http_code?: "" | "301" | "302" | "410";
}): Promise<AdminSeoRedirectsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.per_page) searchParams.set("per_page", String(params.per_page));
    if (params?.search?.trim()) searchParams.set("search", params.search.trim());
    if (params?.is_active === "1" || params?.is_active === "0") searchParams.set("is_active", params.is_active);
    if (params?.http_code) searchParams.set("http_code", params.http_code);

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/seo-redirects${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `SEO redirects API error: ${res.status}`);
    }

    return res.json();
}

export async function createAdminSeoRedirect(payload: {
    from_path: string;
    to_path?: string | null;
    http_code: 301 | 302 | 410;
    is_active?: boolean;
    source?: string;
    note?: string | null;
}) {
    const res = await fetch(`${API_BASE}/admin/seo-redirects`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create redirect API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminSeoRedirect(
    id: number,
    payload: {
        from_path: string;
        to_path?: string | null;
        http_code: 301 | 302 | 410;
        is_active?: boolean;
        source?: string;
        note?: string | null;
    }
) {
    const res = await fetch(`${API_BASE}/admin/seo-redirects/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update redirect API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAdminSeoRedirect(id: number) {
    const res = await fetch(`${API_BASE}/admin/seo-redirects/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete redirect API error: ${res.status}`);
    }

    return res.json();
}
