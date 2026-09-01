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

async function parseError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { message?: string; error?: string };
        return body.message || body.error || `HTTP ${res.status}`;
    } catch {
        return `HTTP ${res.status}`;
    }
}

/** Дата последнего crawl Allparfume: день.месяц (Europe/Minsk). */
export function formatAllparfumeUpdatedAt(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    const parts = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Minsk",
    }).formatToParts(date);
    const day = parts.find((part) => part.type === "day")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (!day || !month) {
        return null;
    }
    return `${day}.${month}`;
}

export async function fetchLastAllparfumeCrawledAt(signal?: AbortSignal): Promise<string | null> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/last-crawled-at`, {
        headers: getAdminHeaders(),
        cache: "no-store",
        signal,
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    const json = (await res.json()) as { data?: { last_crawled_at?: string | null } };
    return json.data?.last_crawled_at ?? null;
}

export type AllparfumeBrandOption = {
    brand_slug: string;
    brand_name: string | null;
    products_count: number;
};

export type AllparfumeShopOfferItem = {
    shop_key: string;
    shop_name: string;
    price: string | number;
    offer_url: string | null;
};

export type AllparfumeVariantItem = {
    id: number;
    allparfume_product_id: number;
    brand_slug: string | null;
    source_brand_name: string | null;
    source_product_name: string | null;
    external_name: string;
    external_slug: string | null;
    external_url: string | null;
    external_id: number | null;
    variant_key: string;
    raw_label: string;
    min_price: string | number | null;
    offers_count: number;
    shop_offers: AllparfumeShopOfferItem[];
    is_linked: boolean;
    match_confidence: number;
    match_confidence_breakdown?: {
        total?: number;
        name_percent?: number;
        name_points?: number;
        name_match_level?: "none" | "exact" | "exact_multiset" | "partial" | "catalog_extra";
        link_match_level?: "none" | "full" | "variant_extra" | "name_only";
        volume_match?: boolean;
        volume_points?: number;
        concentration_match?: boolean;
        concentration_points?: number;
        tester_match?: boolean;
        tester_points?: number;
    } | null;
    status: "confirmed" | "found_unconfirmed" | "unlinked";
    parsed: {
        brand?: string | null;
        product_name?: string | null;
        volume?: number | null;
        concentration?: string | null;
        is_tester?: boolean;
        is_vial?: boolean;
        is_miniature?: boolean;
    } | null;
    brand?: { id: number; name: string } | null;
    product?: {
        id: number;
        name: string;
        display_name?: string;
        slug: string;
    } | null;
    suggested_variant?: {
        id: number;
        product_id: number;
        product_name: string | null;
        display_name?: string | null;
        brand_name: string | null;
        display: string;
    } | null;
    suggested_product?: {
        id: number;
        name: string;
        display_name?: string;
        slug: string | null;
        brand_name: string | null;
        variants_count: number;
    } | null;
    linked_variant?: {
        id: number;
        product_id: number;
        product_name: string | null;
        display_name?: string | null;
        brand_name: string | null;
        display: string;
        price?: string | number | null;
    } | null;
    /** Цена связанного варианта на сайте; null если не связан. */
    site_price: string | number | null;
};

export type AllparfumeVariantsResponse = {
    data: AllparfumeVariantItem[];
    current_page: number;
    last_page: number;
    total: number;
    stats: {
        confirmed: number;
        found_unconfirmed: number;
        unlinked: number;
        last_crawled_at?: string | null;
    };
};

export async function fetchAllparfumeBrands(): Promise<{ data: AllparfumeBrandOption[] }> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/brands`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export async function fetchAllparfumeVariants(params?: {
    brand_slug?: string;
    search?: string;
    status?: "confirmed" | "found_unconfirmed" | "unlinked" | "";
    page?: number;
    per_page?: number;
}): Promise<AllparfumeVariantsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.brand_slug) {
        searchParams.set("brand_slug", params.brand_slug);
    }
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    if (params?.status) {
        searchParams.set("status", params.status);
    }
    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.per_page) {
        searchParams.set("per_page", String(params.per_page));
    }
    const query = searchParams.toString();
    const res = await fetch(
        `${API_BASE}/admin/import-export/allparfume/variants${query ? `?${query}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        },
    );
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export async function runAllparfumeAutoMatch(payload?: {
    brand_slug?: string;
    only_unlinked?: boolean;
}): Promise<{ message?: string; stats: { processed: number; linked: number; suggested: number; skipped: number } }> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/auto-match`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export async function importAllparfumeIds(payload: {
    items: Array<{
        perfumer_url: string | string[];
        allparfume_url: string;
        allparfume_id: number;
    }>;
}): Promise<{
    message?: string;
    stats: {
        updated: number;
        unmatched_slug: number;
        unmatched_allparfume_url: number;
        unmatched_slug_samples?: string[];
        unmatched_allparfume_url_samples?: string[];
    };
}> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/import-ids`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export async function forceLinkAllparfumeVariant(payload: {
    allparfume_variant_id: number;
    variant_id: number;
}): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/force-link`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export async function resetAllparfumeVariantLink(payload: {
    allparfume_variant_id: number;
}): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/reset-link`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(await parseError(res));
    }
    return res.json();
}

export type AllparfumeShopItem = {
    id: number;
    shop_key: string;
    shop_name: string;
    shop_url: string | null;
    is_active: boolean;
    offers_count: number;
};

export type AllparfumeShopsResponse = {
    data: AllparfumeShopItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type AllparfumeSyncJobStatus = {
    job_id: string;
    job_type?: "refresh" | "full" | string;
    status: "queued" | "running" | "completed" | "failed" | string;
    message?: string | null;
    progress?: number;
    processed?: number;
    total?: number;
    stats?: Record<string, unknown>;
    updated_at?: string;
};

export async function fetchAllparfumeShops(params?: {
    search?: string;
    is_active?: boolean | "";
    page?: number;
    per_page?: number;
}): Promise<AllparfumeShopsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.is_active === true) searchParams.set("is_active", "1");
    if (params?.is_active === false) searchParams.set("is_active", "0");
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.per_page) searchParams.set("per_page", String(params.per_page));
    const query = searchParams.toString();
    const res = await fetch(
        `${API_BASE}/admin/import-export/allparfume/shops${query ? `?${query}` : ""}`,
        { headers: getAdminHeaders(), cache: "no-store" },
    );
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export async function updateAllparfumeShopActive(
    id: number,
    isActive: boolean,
): Promise<{ message?: string; data?: AllparfumeShopItem }> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/shops/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export async function startAllparfumeRefreshPrices(): Promise<{
    message?: string;
    job_id: string;
}> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/refresh-prices`, {
        method: "POST",
        headers: getAdminHeaders(),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export async function startAllparfumeFullSync(): Promise<{
    message?: string;
    job_id: string;
}> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/sync-all`, {
        method: "POST",
        headers: getAdminHeaders(),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export async function fetchAllparfumeSyncActive(): Promise<{
    data: AllparfumeSyncJobStatus | null;
}> {
    const res = await fetch(`${API_BASE}/admin/import-export/allparfume/sync/active`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export async function fetchAllparfumeSyncStatus(
    jobId: string,
): Promise<{ data: AllparfumeSyncJobStatus | null }> {
    const res = await fetch(
        `${API_BASE}/admin/import-export/allparfume/sync/${encodeURIComponent(jobId)}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        },
    );
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}
