import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type ImportRetryTaskType =
    | "vanille_catalog_images"
    | "vanille_product_images"
    | "description_rewrite";

export type ImportRetryQueueRow = {
    id: number;
    task_type: ImportRetryTaskType | string;
    product_id: number;
    status: string;
    attempts: number;
    last_error: string | null;
    last_attempt_at: string | null;
    payload?: Record<string, unknown> | null;
    product?: { id: number; name: string; slug: string } | null;
};

function headers(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type ImportRetryQueueCounts = {
    pending_total?: number;
    pending_by_task?: Partial<Record<ImportRetryTaskType | string, number>>;
};

export async function fetchImportRetryQueue(params?: {
    task_type?: ImportRetryTaskType;
    status?: "all" | "pending" | "dismissed" | "resolved";
    page?: number;
    per_page?: number;
}): Promise<{
    data: ImportRetryQueueRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    counts?: ImportRetryQueueCounts;
}> {
    const q = new URLSearchParams();
    if (params?.task_type) {
        q.set("task_type", params.task_type);
    }
    if (params?.status) {
        q.set("status", params.status);
    }
    if (params?.page) {
        q.set("page", String(params.page));
    }
    if (params?.per_page) {
        q.set("per_page", String(params.per_page));
    }
    const qs = q.toString();
    const res = await fetch(`${API_BASE}/admin/import-export/retry-queue${qs ? `?${qs}` : ""}`, {
        headers: headers(),
        cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
    }
    return JSON.parse(text) as Awaited<ReturnType<typeof fetchImportRetryQueue>>;
}

export async function dismissImportRetryItem(
    taskType: ImportRetryTaskType,
    productId: number
): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/import-export/retry-queue/dismiss`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ task_type: taskType, product_id: productId }),
        cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
    }
    return JSON.parse(text) as { message?: string };
}

export async function retryOneImportRetryItem(
    taskType: ImportRetryTaskType,
    productId: number
): Promise<{ message?: string; job: unknown }> {
    const res = await fetch(`${API_BASE}/admin/import-export/retry-queue/retry-one`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ task_type: taskType, product_id: productId }),
        cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
    }
    return JSON.parse(text) as { message?: string; job: unknown };
}

export async function runBulkImportRetry(taskType: ImportRetryTaskType): Promise<{ message?: string; job: unknown }> {
    const res = await fetch(`${API_BASE}/admin/import-export/retry-queue/run-bulk-retry`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ task_type: taskType }),
        cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
    }
    return JSON.parse(text) as { message?: string; job: unknown };
}
