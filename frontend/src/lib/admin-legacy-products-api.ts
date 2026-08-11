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

export type LegacyUnmatchedProductItem = {
    id: number;
    legacy_product_id: number;
    legacy_slug: string | null;
    legacy_name: string | null;
    status: "unmatched" | "linked" | "skipped";
    skip_reason: string | null;
    linked_at: string | null;
    linked_product_id: number | null;
    linked_product_name: string | null;
    linked_product_slug: string | null;
    linked_brand_name: string | null;
};

export type LegacyUnmatchedProductsResponse = {
    data: LegacyUnmatchedProductItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type LegacyUnmatchedProductDetail = {
    id: number;
    legacy_product_id: number;
    legacy_slug: string | null;
    legacy_name: string | null;
    legacy_description: string | null;
    legacy_meta_title: string | null;
    legacy_meta_description: string | null;
    legacy_meta_keyword: string | null;
    status: "unmatched" | "linked" | "skipped";
};

export type LegacyTargetProductCandidate = {
    id: number;
    name: string;
    slug: string;
    brand_name: string | null;
    gender_label?: string | null;
};

export async function fetchAdminLegacyProducts(params?: {
    page?: number;
    status?: "" | "unmatched" | "linked" | "skipped";
    search?: string;
}): Promise<LegacyUnmatchedProductsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search?.trim()) searchParams.set("search", params.search.trim());

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/legacy-products${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Legacy products API error: ${res.status}`);
    }
    return res.json();
}

export async function fetchAdminLegacyProductDetail(id: number): Promise<{ data: LegacyUnmatchedProductDetail }> {
    const res = await fetch(`${API_BASE}/admin/legacy-products/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Legacy product detail API error: ${res.status}`);
    }
    return res.json();
}

export async function searchAdminLegacyProductTargets(id: number, q: string): Promise<{ data: LegacyTargetProductCandidate[] }> {
    const params = new URLSearchParams();
    params.set("q", q);
    const res = await fetch(`${API_BASE}/admin/legacy-products/${id}/target-search?${params.toString()}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Legacy target search API error: ${res.status}`);
    }
    return res.json();
}

export async function linkAdminLegacyProduct(id: number, targetProductId: number) {
    const res = await fetch(`${API_BASE}/admin/legacy-products/${id}/link`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
            target_product_id: targetProductId,
            confirm_replace: true,
        }),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Link legacy product API error: ${res.status}`);
    }
    return res.json();
}

export async function skipAdminLegacyProduct(id: number, reason: string) {
    const res = await fetch(`${API_BASE}/admin/legacy-products/${id}/skip`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ reason }),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Skip legacy product API error: ${res.status}`);
    }
    return res.json();
}
