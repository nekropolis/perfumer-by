import { getAuthToken } from "@/lib/auth-token";
import type {
    ApiResponse,
    LaravelPaginator,
    SellerOnePricingSettings,
    SellerOneParseStartResponse,
    SellerOneParseStatus,
    SellerOneMatchRule,
    SellerOneSupplierProductsResponse,
    SupplierPriceApplyResponse,
    SupplierPricePreviewResponse,
    VanilleImportJobLogRow,
    VanilleImportJobRow,
    VanilleImportQueueJob,
} from "@/types/Vanille";

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

function getAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    const headers: Record<string, string> = {
        Accept: "application/json",
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

function tryParseJsonResponse<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

function trimResponsePreview(text: string, maxLength = 260): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "(empty response body)";
    }
    return normalized.length > maxLength
        ? `${normalized.slice(0, maxLength)}...`
        : normalized;
}

/** HTTP 404 «статус не найден» не должен переключать fallback на /vanille/… */
function isLaravelRouteNotFoundResponse(status: number, text: string, serverMessage?: string): boolean {
    if (status !== 404) {
        return false;
    }

    const blob = `${serverMessage ?? ""} ${text}`;

    return /could not be found/i.test(blob) && /\broute\b/i.test(blob);
}

function buildHttpErrorMessage(params: {
    method: string;
    url: string;
    status: number;
    serverMessage?: string;
    responseText: string;
    redirectedTo?: string;
}): string {
    const details = `${params.method} ${params.url} -> HTTP ${params.status}`;
    const responsePreview = trimResponsePreview(params.responseText);
    const redirectSuffix = params.redirectedTo
        ? ` Redirected to: ${params.redirectedTo}.`
        : "";
    if (params.serverMessage) {
        return `${details}.${redirectSuffix} ${params.serverMessage}. Response: ${responsePreview}`;
    }
    return `${details}.${redirectSuffix} Response: ${responsePreview}`;
}

async function adminVanilleFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const method = options?.method || "GET";
    const res = await fetch(url, {
        ...options,
        headers: {
            ...getAdminHeaders(),
            ...(options?.headers || {}),
        },
        cache: "no-store",
    });

    const text = await res.text();
    const data = tryParseJsonResponse<T & { message?: string }>(text);

    if (!res.ok) {
        throw new Error(buildHttpErrorMessage({
            method,
            url,
            status: res.status,
            serverMessage: data?.message,
            responseText: text,
            redirectedTo: res.redirected ? res.url : undefined,
        }));
    }

    if (!data) {
        throw new Error(buildHttpErrorMessage({
            method,
            url,
            status: res.status,
            serverMessage: "Сервер вернул не JSON",
            responseText: text,
            redirectedTo: res.redirected ? res.url : undefined,
        }));
    }

    return data;
}

async function adminVanilleFetchWithFallback<T>(
    paths: string[],
    options?: RequestInit
): Promise<T> {
    const errors: string[] = [];

    for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        try {
            return await adminVanilleFetch<T>(path, options);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error("Unknown API error");
            errors.push(normalized.message);
            const hasNextFallback = index < paths.length - 1;
            if (hasNextFallback && isLaravelRouteNotFoundError(normalized)) {
                continue;
            }

            throw normalized;
        }
    }

    throw new Error(
        errors.length > 0
            ? `All API fallbacks failed:\n- ${errors.join("\n- ")}`
            : "Vanille API fallback failed"
    );
}

function isLaravelRouteNotFoundError(error: Error): boolean {
    return /could not be found/i.test(error.message) && /\broute\b/i.test(error.message);
}

export async function fetchVanilleSupplierProducts(params?: {
    search?: string;
    linked?: string;
    active?: string;
    page?: number;
}): Promise<ApiResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.linked) {
        searchParams.set("linked", params.linked);
    }

    if (params?.active) {
        searchParams.set("active", params.active);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }

    const query = searchParams.toString();

    return adminVanilleFetch<ApiResponse>(
        `/admin/import-export/vanille/supplier-products${query ? `?${query}` : ""}`
    );
}

export async function importParsedVanilleProducts(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/import-parsed-products",
        {
            method: "POST",
        }
    );
}

export async function parseVanilleBrands(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/parse-brands",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function collectVanilleProductLinks(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/collect-links",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function parseVanilleProducts(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/parse-products",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function parseVanilleCatalogImages(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/parse-catalog-images",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function parseVanilleProductImages(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/parse-product-images",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function rewriteVanilleDescriptions(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/rewrite-descriptions",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function startVanilleRetryFailedJob(taskType: string): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/retry-failed-job",
        { method: "POST", body: JSON.stringify({ task_type: taskType }) }
    );
}

export type VanilleParseSingleProductImportSummary = {
    success?: boolean;
    message?: string;
    imported?: number;
    updated?: number;
    errors?: number;
    items?: number;
    log?: string[];
};

export type VanilleParseSingleProductResponse = {
    message?: string;
    data?: {
        success: boolean;
        file: string;
        file_path: string;
        name: string;
        offers_count: number;
        log: string[];
        message?: string;
        import?: VanilleParseSingleProductImportSummary;
    };
};

export async function parseSingleVanilleProductUrl(
    url: string
): Promise<VanilleParseSingleProductResponse> {
    return adminVanilleFetch<VanilleParseSingleProductResponse>(
        "/admin/import-export/vanille/parse-product-url",
        { method: "POST", body: JSON.stringify({ url: url.trim() }) }
    );
}

export type VanilleSingleUrlMediaFollowUpStep = {
    ok: boolean;
    error?: string;
};

export type VanilleSingleUrlMediaFollowUpResponse = {
    message?: string;
    data?: {
        product_id: number;
        success: boolean;
        steps?: Record<string, VanilleSingleUrlMediaFollowUpStep>;
    };
};

export async function vanilleSingleUrlMediaFollowUp(body: {
    url: string;
    catalog?: boolean;
    gallery?: boolean;
    descriptions?: boolean;
}): Promise<VanilleSingleUrlMediaFollowUpResponse> {
    return adminVanilleFetch<VanilleSingleUrlMediaFollowUpResponse>(
        "/admin/import-export/vanille/single-url-media-follow-up",
        {
            method: "POST",
            body: JSON.stringify({
                url: body.url.trim(),
                catalog: Boolean(body.catalog),
                gallery: Boolean(body.gallery),
                descriptions: Boolean(body.descriptions),
            }),
        }
    );
}

export async function startVanillePipelineNewProducts(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/pipeline/new-products",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function startVanillePipelineRefreshAll(): Promise<{ message?: string; job: VanilleImportQueueJob }> {
    return adminVanilleFetch<{ message?: string; job: VanilleImportQueueJob }>(
        "/admin/import-export/vanille/pipeline/refresh-all",
        { method: "POST", body: JSON.stringify({}) }
    );
}

export async function fetchVanilleParseStatus(): Promise<{ data: VanilleImportQueueJob | null }> {
    return adminVanilleFetch<{ data: VanilleImportQueueJob | null }>(
        "/admin/import-export/vanille/parse-status"
    );
}

export async function fetchVanilleImportJobs(
    page = 1,
    perPage = 15
): Promise<LaravelPaginator<VanilleImportJobRow>> {
    const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    return adminVanilleFetch<LaravelPaginator<VanilleImportJobRow>>(
        `/admin/import-export/vanille/import-jobs?${q.toString()}`
    );
}

export async function fetchVanilleImportJobLogs(
    jobId: number,
    page = 1,
    perPage = 50
): Promise<LaravelPaginator<VanilleImportJobLogRow>> {
    const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    return adminVanilleFetch<LaravelPaginator<VanilleImportJobLogRow>>(
        `/admin/import-export/vanille/import-jobs/${jobId}/logs?${q.toString()}`
    );
}

export async function previewSellerOnePrice(
    file: File,
    options?: { offset?: number; limit?: number }
): Promise<SupplierPricePreviewResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (typeof options?.offset === "number") {
        formData.append("offset", String(options.offset));
    }
    if (typeof options?.limit === "number") {
        formData.append("limit", String(options.limit));
    }

    const method = "POST";
    const previewPaths = [
        "/admin/import-export/seller-one/supplier-price/preview",
        "/admin/import-export/vanille/supplier-price/preview",
    ];
    const errors: string[] = [];

    for (let index = 0; index < previewPaths.length; index += 1) {
        const path = previewPaths[index];
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                ...getAuthHeaders(),
            },
            body: formData,
            cache: "no-store",
        });

        const text = await res.text();
        const data = tryParseJsonResponse<SupplierPricePreviewResponse & { message?: string }>(text);

        if (res.ok && data) {
            return data;
        }

        const message = buildHttpErrorMessage({
            method,
            url,
            status: res.status,
            serverMessage: res.ok ? "Сервер вернул не JSON" : data?.message,
            responseText: text,
            redirectedTo: res.redirected ? res.url : undefined,
        });
        errors.push(message);

        const hasNextFallback = index < previewPaths.length - 1;
        if (
            hasNextFallback
            && isLaravelRouteNotFoundResponse(res.status, text, data?.message)
        ) {
            continue;
        }

        throw new Error(message);
    }

    throw new Error(
        errors.length > 0
            ? `All preview API fallbacks failed:\n- ${errors.join("\n- ")}`
            : "Preview API fallback failed"
    );
}

export async function startSellerOneParseJob(file: File): Promise<SellerOneParseStartResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const method = "POST";
    const paths = [
        "/admin/import-export/seller-one/supplier-price/start",
        "/admin/import-export/vanille/supplier-price/start",
    ];
    const errors: string[] = [];

    for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                ...getAuthHeaders(),
            },
            body: formData,
            cache: "no-store",
        });

        const text = await res.text();
        const data = tryParseJsonResponse<SellerOneParseStartResponse & { message?: string }>(text);

        if (res.ok && data) {
            return data;
        }

        const message = buildHttpErrorMessage({
            method,
            url,
            status: res.status,
            serverMessage: res.ok ? "Сервер вернул не JSON" : data?.message,
            responseText: text,
            redirectedTo: res.redirected ? res.url : undefined,
        });
        errors.push(message);

        const hasNextFallback = index < paths.length - 1;
        if (
            hasNextFallback
            && isLaravelRouteNotFoundResponse(res.status, text, data?.message)
        ) {
            continue;
        }

        throw new Error(message);
    }

    throw new Error(
        errors.length > 0
            ? `All start parse API fallbacks failed:\n- ${errors.join("\n- ")}`
            : "Start parse API fallback failed"
    );
}

export async function fetchSellerOneParseStatus(jobId: string): Promise<{ data: SellerOneParseStatus | null }> {
    return adminVanilleFetchWithFallback<{ data: SellerOneParseStatus }>(
        [
            `/admin/import-export/seller-one/supplier-price/status/${jobId}`,
            `/admin/import-export/vanille/supplier-price/status/${jobId}`,
        ]
    );
}

/**
 * Возвращает текущий активный Seller One parse без указания jobId.
 * Используется виджетом активных задач в шапке, чтобы показывать статус,
 * даже если jobId не сохранён в localStorage этой вкладки (джоб мог быть
 * запущен в другом браузере/сессии).
 *
 * Контракт: `{ data: null }` — нет активных; иначе — обычный SellerOneParseStatus.
 */
export async function fetchSellerOneActiveStatus(): Promise<{ data: SellerOneParseStatus | null }> {
    return adminVanilleFetchWithFallback<{ data: SellerOneParseStatus | null }>(
        [
            "/admin/import-export/seller-one/supplier-price/active",
            "/admin/import-export/vanille/supplier-price/active",
        ]
    );
}

export async function applySellerOnePrice(rows: Array<{
    code: string;
    title: string;
    supplier_price: number | null;
    selected_variant_id: number | null;
}>): Promise<SupplierPriceApplyResponse> {
    return adminVanilleFetch<SupplierPriceApplyResponse>(
        "/admin/import-export/seller-one/supplier-price/apply",
        {
            method: "POST",
            body: JSON.stringify({ rows }),
        }
    );
}

export async function startSellerOneRefreshLinkedPricesJob(file: File): Promise<SellerOneParseStartResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const method = "POST";
    const paths = [
        "/admin/import-export/seller-one/supplier-price/refresh-linked/start",
        "/admin/import-export/vanille/supplier-price/refresh-linked/start",
    ];
    const errors: string[] = [];

    for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                ...getAuthHeaders(),
            },
            body: formData,
            cache: "no-store",
        });

        const text = await res.text();
        const data = tryParseJsonResponse<SellerOneParseStartResponse & { message?: string }>(text);

        if (res.ok && data) {
            return data;
        }

        const message = buildHttpErrorMessage({
            method,
            url,
            status: res.status,
            serverMessage: res.ok ? "Сервер вернул не JSON" : data?.message,
            responseText: text,
            redirectedTo: res.redirected ? res.url : undefined,
        });
        errors.push(message);

        const hasNextFallback = index < paths.length - 1;
        if (
            hasNextFallback
            && isLaravelRouteNotFoundResponse(res.status, text, data?.message)
        ) {
            continue;
        }

        throw new Error(message);
    }

    throw new Error(
        errors.length > 0
            ? `All refresh-linked start API fallbacks failed:\n- ${errors.join("\n- ")}`
            : "Refresh-linked start API fallback failed"
    );
}

export async function fetchSellerOneRefreshLinkedJobStatus(jobId: string): Promise<{ data: SellerOneParseStatus | null }> {
    return adminVanilleFetchWithFallback<{ data: SellerOneParseStatus }>(
        [
            `/admin/import-export/seller-one/supplier-price/refresh-linked/status/${jobId}`,
            `/admin/import-export/vanille/supplier-price/refresh-linked/status/${jobId}`,
        ]
    );
}

export async function fetchSellerOneSupplierProducts(params?: {
    search?: string;
    status?: "confirmed" | "found_unconfirmed" | "new" | "unlinked" | "parsing_inactive" | "";
    page?: number;
}): Promise<SellerOneSupplierProductsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.status) {
        searchParams.set("status", params.status);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }

    const query = searchParams.toString();

    return adminVanilleFetchWithFallback<SellerOneSupplierProductsResponse>(
        [
            `/admin/import-export/seller-one/supplier-products${query ? `?${query}` : ""}`,
            `/admin/import-export/vanille/supplier-products${query ? `?${query}` : ""}`,
        ]
    );
}

export async function forceLinkSellerOneProduct(payload: {
    supplier_product_id: number;
    variant_id: number;
}): Promise<{ message?: string }> {
    return adminVanilleFetchWithFallback<{ message?: string }>(
        [
            "/admin/import-export/seller-one/supplier-products/force-link",
            "/admin/import-export/vanille/supplier-products/force-link",
        ],
        {
            method: "POST",
            body: JSON.stringify(payload),
        }
    );
}

export async function resetSellerOneProductLink(payload: {
    supplier_product_id: number;
}): Promise<{ message?: string }> {
    return adminVanilleFetchWithFallback<{ message?: string }>(
        [
            "/admin/import-export/seller-one/supplier-products/reset-link",
            "/admin/import-export/vanille/supplier-products/reset-link",
        ],
        {
            method: "POST",
            body: JSON.stringify(payload),
        }
    );
}

export async function updateSellerOneSupplierProductParsingActive(payload: {
    supplier_product_id: number;
    link_parsing_active: boolean;
}): Promise<{ message?: string; data?: { id: number; link_parsing_active: boolean } }> {
    return adminVanilleFetchWithFallback<{ message?: string; data?: { id: number; link_parsing_active: boolean } }>(
        [
            "/admin/import-export/seller-one/supplier-products/parsing-active",
            "/admin/import-export/vanille/supplier-products/parsing-active",
        ],
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        }
    );
}

export async function fetchSellerOneRules(): Promise<{ data: SellerOneMatchRule[] }> {
    return adminVanilleFetchWithFallback<{ data: SellerOneMatchRule[] }>(
        [
            "/admin/import-export/seller-one/rules",
            "/admin/import-export/vanille/rules",
        ]
    );
}

export async function createSellerOneRule(payload: {
    pattern: string;
    replacement: string;
    is_active?: boolean;
    sort_order?: number;
}): Promise<{ message?: string; data: SellerOneMatchRule }> {
    return adminVanilleFetchWithFallback<{ message?: string; data: SellerOneMatchRule }>(
        [
            "/admin/import-export/seller-one/rules",
            "/admin/import-export/vanille/rules",
        ],
        {
            method: "POST",
            body: JSON.stringify(payload),
        }
    );
}

export async function updateSellerOneRule(
    id: number,
    payload: {
        pattern: string;
        replacement: string;
        is_active?: boolean;
        sort_order?: number;
    }
): Promise<{ message?: string; data: SellerOneMatchRule }> {
    return adminVanilleFetchWithFallback<{ message?: string; data: SellerOneMatchRule }>(
        [
            `/admin/import-export/seller-one/rules/${id}`,
            `/admin/import-export/vanille/rules/${id}`,
        ],
        {
            method: "PUT",
            body: JSON.stringify(payload),
        }
    );
}

export async function deleteSellerOneRule(id: number): Promise<{ message?: string }> {
    return adminVanilleFetchWithFallback<{ message?: string }>(
        [
            `/admin/import-export/seller-one/rules/${id}`,
            `/admin/import-export/vanille/rules/${id}`,
        ],
        {
            method: "DELETE",
        }
    );
}

export async function fetchSellerOnePricingSettings(): Promise<{ data: SellerOnePricingSettings }> {
    return adminVanilleFetchWithFallback<{ data: SellerOnePricingSettings }>(
        [
            "/admin/import-export/seller-one/pricing-settings",
            "/admin/import-export/vanille/pricing-settings",
        ]
    );
}

export async function updateSellerOnePricingSettings(
    payload: SellerOnePricingSettings
): Promise<{ message?: string; data: SellerOnePricingSettings }> {
    return adminVanilleFetchWithFallback<{ message?: string; data: SellerOnePricingSettings }>(
        [
            "/admin/import-export/seller-one/pricing-settings",
            "/admin/import-export/vanille/pricing-settings",
        ],
        {
            method: "PUT",
            body: JSON.stringify(payload),
        }
    );
}
