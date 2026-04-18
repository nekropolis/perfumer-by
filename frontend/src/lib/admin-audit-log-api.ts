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

export type AuditLogActor = {
    id: number;
    name: string | null;
    email: string | null;
};

export type AuditLogRow = {
    id: number;
    entity_type: string;
    entity_id: number | null;
    action: string;
    summary: string;
    context: Record<string, unknown> | null;
    actor_id: number | null;
    ip_address: string | null;
    created_at: string;
    actor?: AuditLogActor | null;
};

export type PaginatedAuditLogs = {
    data: AuditLogRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export type FetchAuditLogsParams = {
    page?: number;
    per_page?: number;
    entity_type?: string;
    action?: string;
};

export async function fetchAuditLogs(
    params: FetchAuditLogsParams = {},
): Promise<PaginatedAuditLogs> {
    const search = new URLSearchParams();

    if (params.page) {
        search.set("page", String(params.page));
    }

    if (params.per_page) {
        search.set("per_page", String(params.per_page));
    }

    if (params.entity_type) {
        search.set("entity_type", params.entity_type);
    }

    if (params.action) {
        search.set("action", params.action);
    }

    const qs = search.toString();
    const url = `${API_BASE}/admin/system/audit-log${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Audit log API error: ${res.status}`);
    }

    return res.json();
}
