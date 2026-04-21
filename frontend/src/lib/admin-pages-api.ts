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

export type AdminPageItem = {
    id: number;
    name: string;
    slug: string;
    h1?: string | null;
    is_active: boolean;
    seo_title?: string | null;
    updated_at?: string | null;
};

export type AdminPagesResponse = {
    data: AdminPageItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type AdminPageDetailResponse = {
    data: AdminPageItem & {
        content?: string | null;
        seo_description?: string | null;
    };
};

export async function fetchAdminPages(params?: { search?: string; page?: number }): Promise<AdminPagesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/pages${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Pages API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminPageById(id: number | string): Promise<AdminPageDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/pages/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Page detail API error: ${res.status}`);
    }

    return res.json();
}

export async function createAdminPage(payload: {
    name: string;
    slug: string;
    h1?: string;
    content?: string;
    seo_title?: string;
    seo_description?: string;
    is_active?: boolean;
}) {
    const res = await fetch(`${API_BASE}/admin/pages`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create page API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminPage(id: number, payload: {
    name: string;
    slug: string;
    h1?: string;
    content?: string;
    seo_title?: string;
    seo_description?: string;
    is_active?: boolean;
}) {
    const res = await fetch(`${API_BASE}/admin/pages/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update page API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAdminPage(id: number) {
    const res = await fetch(`${API_BASE}/admin/pages/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete page API error: ${res.status}`);
    }

    return res.json();
}
