import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type AdminReviewItem = {
    id: number;
    type: "product" | "store";
    product_id: number | null;
    product: { id: number; name: string; slug: string } | null;
    name: string;
    text: string;
    stars: number;
    status: "pending" | "published" | "rejected";
    published_at: string | null;
    reply_text: string | null;
    replied_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type AdminReviewsListResponse = {
    data: AdminReviewItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type AdminReviewsStatsResponse = {
    data: {
        pending_count: number;
    };
};

export async function fetchAdminReviewsStats(signal?: AbortSignal): Promise<AdminReviewsStatsResponse> {
    const res = await fetch(`${API_BASE}/admin/reviews/stats`, {
        headers: getAdminHeaders(),
        cache: "no-store",
        signal,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Reviews stats API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminReviews(params: {
    page?: number;
    search?: string;
    status?: string;
    type?: string;
    days?: string;
}): Promise<AdminReviewsListResponse> {
    const sp = new URLSearchParams();
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    if (params.search?.trim()) sp.set("search", params.search.trim());
    if (params.status) sp.set("status", params.status);
    if (params.type) sp.set("type", params.type);
    if (params.days) sp.set("days", params.days);

    const q = sp.toString();
    const res = await fetch(`${API_BASE}/admin/reviews${q ? `?${q}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Reviews admin API error: ${res.status}`);
    }

    return res.json();
}

export async function patchAdminReviewStatus(
    id: number,
    status: AdminReviewItem["status"],
): Promise<{ message: string; data: AdminReviewItem }> {
    const res = await fetch(`${API_BASE}/admin/reviews/${id}/status`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ status }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Review status API error: ${res.status}`);
    }

    return res.json();
}

export async function patchAdminReviewReply(
    id: number,
    replyText: string | null,
): Promise<{ message: string; data: AdminReviewItem }> {
    const res = await fetch(`${API_BASE}/admin/reviews/${id}/reply`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ reply_text: replyText }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Review reply API error: ${res.status}`);
    }

    return res.json();
}
