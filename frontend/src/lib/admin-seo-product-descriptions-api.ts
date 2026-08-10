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

export type ProductSeoRemoteStats = {
    pending: number;
    queued: number;
    processing: number;
    in_flight: number;
    completed: number;
    failed: number;
    skipped: number;
    undelivered: number;
    daily_used: number;
    /** null = безлимит */
    daily_limit: number | null;
    daily_unlimited: boolean;
    monthly_used: number;
    /** null или 0 = безлимит */
    monthly_quota: number | null;
};

export type ProductSeoWorkOverview = {
    eligible_products: number;
    missing_fields: {
        seo_description: number;
        short_description: number;
        description: number;
    };
    receipts_complete: number;
    remote: ProductSeoRemoteStats | null;
    remote_error: string | null;
};

export type ProductSeoBatchItem = {
    id: number;
    external_batch_id: string | null;
    status: "pending" | "submitted" | "failed";
    requested_count: number;
    accepted_count: number;
    queued_count: number;
    applied_count: number;
    failed_count: number;
    force: boolean;
    error: string | null;
    items_count: number;
    applied_items_count: number;
    failed_items_count: number;
    submitted_at: string | null;
    created_at: string | null;
};

async function parseError(res: Response, fallback: string): Promise<string> {
    const text = await res.text();
    try {
        const parsed = text ? (JSON.parse(text) as { message?: string }) : null;
        return parsed?.message || text || fallback;
    } catch {
        return text || fallback;
    }
}

export async function fetchProductSeoWorkOverview(): Promise<{ data: ProductSeoWorkOverview }> {
    const res = await fetch(`${API_BASE}/admin/seo/product-descriptions`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(await parseError(res, `SEO overview API error: ${res.status}`));
    }
    return res.json();
}

export async function fetchProductSeoBatches(params?: {
    page?: number;
    per_page?: number;
}): Promise<{
    data: ProductSeoBatchItem[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
}> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.per_page) query.set("per_page", String(params.per_page));
    const res = await fetch(
        `${API_BASE}/admin/seo/product-descriptions/batches${query.size ? `?${query}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        },
    );
    if (!res.ok) {
        throw new Error(await parseError(res, `SEO batches API error: ${res.status}`));
    }
    return res.json();
}

export async function submitProductSeoWork(payload?: {
    limit?: number;
    force?: boolean;
}): Promise<{
    message?: string;
    data: {
        id: number;
        external_batch_id: string | null;
        status: string;
        requested_count: number;
        accepted_count: number;
        queued_count: number;
    };
}> {
    const res = await fetch(`${API_BASE}/admin/seo/product-descriptions/work`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload ?? {}),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(await parseError(res, `SEO work API error: ${res.status}`));
    }
    return res.json();
}

export async function pullProductSeoReady(payload?: {
    limit?: number;
}): Promise<{
    message?: string;
    data: {
        fetched: number;
        applied: number;
        failed: number;
        skipped: number;
        acked: number;
    };
}> {
    const res = await fetch(`${API_BASE}/admin/seo/product-descriptions/ready`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload ?? {}),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(await parseError(res, `SEO ready API error: ${res.status}`));
    }
    return res.json();
}
