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

export type BrandItem = {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    seo_keyword?: string | null;
    is_active: boolean;
    products_count: number;
};

export type BrandsResponse = {
    data: BrandItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type BrandResponse = {
    data: BrandItem;
};

export async function fetchBrands(params?: {
    search?: string;
    page?: number;
}): Promise<BrandsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }

    const query = searchParams.toString();
    const url = `${API_BASE}/admin/brands${query ? `?${query}` : ""}`;

    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Brands API error: ${res.status}`);
    }

    return res.json();
}

export async function createBrand(payload: {
    name: string;
    slug?: string;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    seo_keyword?: string | null;
    is_active?: boolean;
}) {
    const res = await fetch(`${API_BASE}/admin/brands`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create brand API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchBrand(id: number): Promise<BrandResponse> {
    const res = await fetch(`${API_BASE}/admin/brands/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Brand API error: ${res.status}`);
    }

    return res.json();
}

export async function updateBrand(
    id: number,
    payload: {
        name: string;
        slug?: string;
        description?: string | null;
        seo_title?: string | null;
        seo_description?: string | null;
        seo_keyword?: string | null;
        is_active?: boolean;
    }
) {
    const res = await fetch(`${API_BASE}/admin/brands/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update brand API error: ${res.status}`);
    }

    return res.json();
}
export async function deleteBrand(id: number) {
    const res = await fetch(`${API_BASE}/admin/brands/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete brand API error: ${res.status}`);
    }

    return res.json();
}
