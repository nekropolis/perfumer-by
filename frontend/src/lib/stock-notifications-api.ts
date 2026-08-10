import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type CustomerRequestKind = "back_in_stock" | "callback";

export type StockNotificationRequestData = {
    id: number;
    kind: CustomerRequestKind | string;
    product_id: number | null;
    variant_id: number | null;
    product_name: string | null;
    variant_title: string | null;
    phone: string;
    comment: string | null;
    status: "new" | "notified" | "cancelled" | string;
    notified_at: string | null;
    created_at: string | null;
    product?: {
        id: number | null;
        name: string | null;
        slug: string | null;
    };
};

export type CreateStockNotificationPayload = {
    product_id: number;
    variant_id?: number | null;
    phone: string;
    phone_plain_digits?: boolean;
    comment?: string;
    consent_privacy: boolean;
};

export type CreateCallbackRequestPayload = {
    product_id?: number | null;
    variant_id?: number | null;
    phone: string;
    phone_plain_digits?: boolean;
    comment?: string;
    consent_privacy: boolean;
};

export type CreateStockNotificationResponse = {
    data: StockNotificationRequestData;
    message: string;
    duplicate?: boolean;
};

export type CreateCallbackRequestResponse = CreateStockNotificationResponse;

function getHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
        cache: "no-store",
    });

    let parsed: unknown = null;
    try {
        parsed = await res.json();
    } catch {
        parsed = null;
    }

    if (!res.ok) {
        // Собираем message отдельным шагом: цепочка && возвращала
        // union-тип вроде `string | boolean | {}`, а конструктор Error
        // требует строго `string`. TS13/ESNext особенно строг с такими
        // implicit-кастами, поэтому разворачиваем в явную проверку.
        let message = `Customer request API error: ${res.status}`;
        if (
            parsed &&
            typeof parsed === "object" &&
            "message" in parsed &&
            typeof (parsed as { message?: unknown }).message === "string"
        ) {
            message = (parsed as { message: string }).message;
        }
        const error = new Error(message) as Error & {
            status?: number;
            errors?: Record<string, string[]>;
        };
        error.status = res.status;
        if (
            parsed &&
            typeof parsed === "object" &&
            "errors" in (parsed as Record<string, unknown>)
        ) {
            error.errors = (parsed as { errors?: Record<string, string[]> }).errors;
        }
        throw error;
    }

    return parsed as T;
}

export async function createStockNotificationRequest(
    payload: CreateStockNotificationPayload,
): Promise<CreateStockNotificationResponse> {
    return postJson<CreateStockNotificationResponse>(
        `${API_BASE}/stock-notifications`,
        payload,
    );
}

export async function createCallbackRequest(
    payload: CreateCallbackRequestPayload,
): Promise<CreateCallbackRequestResponse> {
    return postJson<CreateCallbackRequestResponse>(
        `${API_BASE}/callback-requests`,
        payload,
    );
}

export type StockNotificationsListResponse = {
    data: StockNotificationRequestData[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type StockNotificationStatsResponse = {
    data: {
        back_in_stock_new: number;
        callback_new: number;
    };
};

export async function fetchAdminStockNotificationStats(signal?: AbortSignal): Promise<StockNotificationStatsResponse> {
    const res = await fetch(`${API_BASE}/admin/stock-notifications/stats`, {
        headers: getHeaders(),
        cache: "no-store",
        signal,
    });

    if (!res.ok) {
        throw new Error(`Stock notification stats API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminStockNotifications(params?: {
    search?: string;
    status?: string;
    kind?: CustomerRequestKind | string;
}): Promise<StockNotificationsListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.kind) searchParams.set("kind", params.kind);

    const query = searchParams.toString();
    const url = `${API_BASE}/admin/stock-notifications${query ? `?${query}` : ""}`;

    const res = await fetch(url, {
        headers: getHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Stock notifications API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminStockNotificationStatus(
    id: number,
    status: "new" | "notified" | "cancelled",
): Promise<{ data: StockNotificationRequestData; message: string }> {
    const res = await fetch(
        `${API_BASE}/admin/stock-notifications/${id}/status`,
        {
            method: "PATCH",
            headers: getHeaders(),
            body: JSON.stringify({ status }),
            cache: "no-store",
        },
    );

    if (!res.ok) {
        throw new Error(`Stock notification status API error: ${res.status}`);
    }

    return res.json();
}
