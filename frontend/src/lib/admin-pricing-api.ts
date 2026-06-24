import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function getAdminHeaders(skipJsonContentType = false) {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
    };
    if (!skipJsonContentType) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}

export type PriceFormulaVariantRule = {
    field: "is_promotion" | "is_preorder" | "is_tester" | "is_vial";
    op?: "eq" | "neq";
    value: boolean;
};

export type PriceFormulaItem = {
    id: number;
    name: string;
    source_type: "supplier" | "warehouse";
    source_id: number;
    multiplier: string | number;
    rub_rate: string | number;
    addend: string | number;
    round_precision: number;
    variant_rule_mode: "apply_to_all" | "apply_when_match" | "skip_when_match";
    variant_rules: PriceFormulaVariantRule[] | null;
    is_active: boolean;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
};

export type PriceFormulaPayload = Omit<PriceFormulaItem, "id" | "created_at" | "updated_at">;

export type PricingSourceOption = {
    id: number;
    name: string;
    code: string;
};

export type PricingSourcesResponse = {
    data: {
        suppliers: PricingSourceOption[];
        warehouses: PricingSourceOption[];
    };
};

export type SupplierPriceFileMeta = {
    supplier_id: number;
    supplier_name: string;
    supplier_code: string;
    storage_path: string | null;
    original_name: string | null;
    uploaded_at: string | null;
};

export type PriceRefreshRunItem = {
    id: number;
    status: "queued" | "running" | "completed" | "failed";
    triggered_by: number | null;
    started_at: string | null;
    finished_at: string | null;
    stats: Record<string, unknown> | null;
    error_message: string | null;
    job_id: string | null;
    created_at: string;
    triggered_by_user?: { id: number; name: string; email: string } | null;
};

export type PriceRefreshJobStatus = {
    job_id: string;
    run_id?: number;
    status: string;
    message?: string;
    stats?: Record<string, unknown>;
    phase?: string;
    processed?: number;
    total?: number;
    total_linked?: number;
    progress?: number;
    supplier_code?: string;
    supplier_name?: string;
    updated_at?: string;
};

export async function fetchPriceFormulas(params?: {
    page?: number;
    source_type?: string;
    source_id?: number;
}): Promise<{ data: PriceFormulaItem[]; current_page: number; last_page: number; total: number }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.source_type) query.set("source_type", params.source_type);
    if (params?.source_id) query.set("source_id", String(params.source_id));

    const res = await fetch(`${API_BASE}/admin/pricing/formulas?${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить формулы цен");
    return res.json();
}

export async function createPriceFormula(payload: PriceFormulaPayload) {
    const res = await fetch(`${API_BASE}/admin/pricing/formulas`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Ошибка создания формулы");
    return data as { message: string; data: PriceFormulaItem };
}

export async function updatePriceFormula(id: number, payload: PriceFormulaPayload) {
    const res = await fetch(`${API_BASE}/admin/pricing/formulas/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Ошибка обновления формулы");
    return data as { message: string; data: PriceFormulaItem };
}

export async function deletePriceFormula(id: number) {
    const res = await fetch(`${API_BASE}/admin/pricing/formulas/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Ошибка удаления формулы");
    return data as { message: string };
}

export async function fetchPricingSources(): Promise<PricingSourcesResponse> {
    const res = await fetch(`${API_BASE}/admin/pricing/sources`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить источники");
    return res.json();
}

export async function fetchSupplierPriceFiles(): Promise<{ data: SupplierPriceFileMeta[] }> {
    const res = await fetch(`${API_BASE}/admin/pricing/price-files`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить прайсы");
    return res.json();
}

export async function uploadSupplierPriceFile(supplierId: number, file: File) {
    const form = new FormData();
    form.append("supplier_id", String(supplierId));
    form.append("file", file);

    const res = await fetch(`${API_BASE}/admin/pricing/price-files/upload`, {
        method: "POST",
        headers: getAdminHeaders(true),
        body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || Object.values(data.errors || {}).flat().join(", ") || "Ошибка загрузки");
    return data;
}

export async function fetchPriceRefreshRuns(page = 1) {
    const res = await fetch(`${API_BASE}/admin/pricing/refresh/runs?page=${page}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить историю");
    return res.json() as Promise<{
        data: PriceRefreshRunItem[];
        current_page: number;
        last_page: number;
        total: number;
    }>;
}

export async function startPriceRefresh() {
    const res = await fetch(`${API_BASE}/admin/pricing/refresh/start`, {
        method: "POST",
        headers: getAdminHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Не удалось запустить обновление");
    return data as { message: string; job_id: string; run_id: number };
}

export async function fetchPriceRefreshStatus(jobId: string) {
    const res = await fetch(`${API_BASE}/admin/pricing/refresh/status/${jobId}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось получить статус");
    return res.json() as Promise<{ data: PriceRefreshJobStatus | null }>;
}

export async function fetchActivePriceRefresh() {
    const res = await fetch(`${API_BASE}/admin/pricing/refresh/active`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось получить активную задачу");
    return res.json() as Promise<{ data: PriceRefreshJobStatus | null }>;
}

export type ManualPriceReviewReason =
    | "no_receipt_supplier"
    | "no_supplier_match"
    | "warehouse_not_lower";

export type ManualPriceReviewItem = {
    id: number;
    variant_id: number;
    product_id: number;
    reason: ManualPriceReviewReason;
    warehouse_purchase: string | number;
    supplier_purchase: string | number | null;
    receipt_supplier_id: number | null;
    supplier_sku: string | null;
    supplier_external_code: string | null;
    product_name: string;
    variant_title: string;
    manual_retail_price: string | number | null;
    list_on_storefront: boolean;
    manual_set_at: string | null;
    receipt_supplier?: { id: number; name: string; code: string } | null;
};

export async function fetchManualPriceReviews(params?: { page?: number; search?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.search) query.set("search", params.search);

    const res = await fetch(`${API_BASE}/admin/pricing/manual-reviews?${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить ручную очередь");
    return res.json() as Promise<{
        data: ManualPriceReviewItem[];
        current_page: number;
        last_page: number;
        total: number;
    }>;
}

export async function fetchManualPriceReviewStats() {
    const res = await fetch(`${API_BASE}/admin/pricing/manual-reviews/stats`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Не удалось загрузить статистику");
    return res.json() as Promise<{ data: { active_count: number } }>;
}

export async function saveManualPriceReview(
    id: number,
    payload: { manual_retail_price: number; list_on_storefront: boolean },
) {
    const res = await fetch(`${API_BASE}/admin/pricing/manual-reviews/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Ошибка сохранения");
    return data as { message: string; data: ManualPriceReviewItem };
}
