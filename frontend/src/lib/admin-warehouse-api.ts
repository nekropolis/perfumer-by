import { getAuthToken } from "@/lib/auth-token";
import type { StockReceiptStatus, StockWriteoffStatus } from "@/lib/warehouse-document-status";

export type { StockReceiptStatus, StockWriteoffStatus } from "@/lib/warehouse-document-status";
export {
    STOCK_RECEIPT_STATUS,
    STOCK_RECEIPT_STATUS_LABELS,
    STOCK_WRITEOFF_STATUS,
    STOCK_WRITEOFF_STATUS_LABELS,
    getStockReceiptStatusLabel,
    getStockWriteoffStatusLabel,
} from "@/lib/warehouse-document-status";

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

function getAdminAuthHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type WarehouseSupplierOption = {
    id: number;
    name: string;
    code: string;
};

export type WarehouseOption = {
    id: number;
    code: string;
    name: string;
    is_default?: boolean;
};

export type WarehouseSuppliersResponse = {
    data: WarehouseSupplierOption[];
};

export type WarehouseOptionsResponse = {
    data: WarehouseOption[];
};

export type StockReceiptListItem = {
    id: number;
    document_no: string | null;
    warehouse_id?: number | null;
    warehouse?: WarehouseOption | null;
    supplier_id?: number | null;
    supplier_code?: string | null;
    supplier_name: string;
    status: StockReceiptStatus;
    received_at?: string | null;
    comment?: string | null;
    items?: StockReceiptItem[];
    created_at?: string;
};

export type StockReceiptItem = {
    id: number;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_title: string;
    qty: number;
    supplier_price: string | number;
    line_total?: string | number;
    supplier_sku?: string | null;
    payload?: Record<string, unknown> | null;
};

export type StockReceiptsResponse = {
    data: StockReceiptListItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type StockReceiptDetailResponse = {
    data: StockReceiptListItem;
};

export type StockReceiptPayload = {
    warehouse_id?: number | null;
    supplier_id?: number | null;
    supplier_code?: string | null;
    supplier_name: string;
    received_at?: string | null;
    comment?: string;
    items: Array<{
        product_id: number;
        variant_id?: number | null;
        variant_definition_id?: number | null;
        qty: number;
        supplier_price: number;
        supplier_sku?: string;
        payload?: Record<string, unknown>;
        variant_definition?: {
            volume_ml: number;
            concentration_code: string;
            concentration_label: string;
            is_tester?: boolean;
        };
    }>;
};

export type StockReceiptImportXlsPrepareResponse = {
    session_id: string;
    total_rows: number;
};

export type StockReceiptImportXlsResolveBatchResponse = {
    next_offset: number;
    total_rows: number;
    done: boolean;
    unresolved: Array<Record<string, unknown>>;
};

export type StockReceiptImportXlsCommitPayload = {
    session_id: string;
    warehouse_id?: number | null;
    supplier_id?: number | null;
    supplier_code?: string | null;
    supplier_name?: string | null;
    received_at?: string | null;
    comment?: string;
    mapping?: StockReceiptImportXlsPayload["mapping"];
};

export type StockReceiptImportXlsCommitResponse = {
    message?: string;
    data: StockReceiptListItem;
    committed_map_keys: string[];
    committed_rows_count: number;
    created_new_receipt: boolean;
};

export type StockReceiptImportXlsState = {
    session_id?: string | null;
    warehouse_id?: number | null;
    supplier_id?: number | null;
    received_at?: string | null;
    comment?: string | null;
    parsed_total_rows?: number | null;
    linked_draft_receipt_id?: number | null;
    unresolved?: Array<Record<string, unknown>>;
    mapping_by_key?: Record<string, string>;
};

export type StockReceiptImportXlsPayload = {
    file: File;
    warehouse_id?: number | null;
    supplier_id?: number | null;
    supplier_code?: string | null;
    supplier_name?: string | null;
    received_at?: string | null;
    comment?: string;
    mapping?: Array<{
        map_key?: string;
        code?: string;
        title?: string;
        variant_id?: number;
        selected_variant_id?: number;
    }>;
};

export type StockWriteoffItem = {
    id: number;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_title: string;
    qty: number;
    price?: string | number | null;
    payload?: Record<string, unknown> | null;
};

export type StockWriteoffListItem = {
    id: number;
    document_no: string | null;
    warehouse_id?: number | null;
    warehouse?: WarehouseOption | null;
    type: string;
    order_id?: number | null;
    status: StockWriteoffStatus;
    written_off_at?: string | null;
    comment?: string | null;
    items?: StockWriteoffItem[];
};

export type StockWriteoffsResponse = {
    data: StockWriteoffListItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type StockWriteoffPayload = {
    document_kind?: "writeoff" | "reserve";
    warehouse_id?: number | null;
    written_off_at?: string | null;
    comment?: string;
    items: Array<{
        product_id: number;
        variant_id: number;
        qty: number;
        price?: number | null;
        payload?: Record<string, unknown>;
        stock_source?: "available" | "reserved";
    }>;
};

export type StockWriteoffDetailResponse = {
    data: StockWriteoffListItem;
    can_reverse: boolean;
};

export type StockBalanceItem = {
    id: number;
    variant_id?: number;
    warehouse_id?: number;
    warehouse_name?: string | null;
    product_id: number;
    product_name: string | null;
    product_slug: string | null;
    brand_name: string | null;
    variant_title: string;
    stock: number;
    reserved_stock: number;
    available_stock: number;
    price?: string | number | null;
    is_active: boolean;
};

export type StockBalancesResponse = {
    data: StockBalanceItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type StockReportReceiptsResponse = {
    data: StockReceiptListItem[];
    current_page: number;
    last_page: number;
    total: number;
    summary: {
        documents_count: number;
        qty_total: number;
        amount_total: number;
    };
};

export type StockReportWriteoffsResponse = {
    data: StockWriteoffListItem[];
    current_page: number;
    last_page: number;
    total: number;
    summary: {
        documents_count: number;
        qty_total: number;
    };
};

export type StockSalesReportRow = {
    period?: string;
    orders_count?: number;
    qty_total: number;
    revenue_total?: number | string;
    product_id?: number;
    product_name?: string | null;
    variant_title?: string | null;
};

export type StockSalesReportResponse = {
    data: StockSalesReportRow[];
    report_by?: "orders" | "products";
    summary: {
        orders_count: number;
        qty_total: number;
        revenue_total: number;
    };
};

export type SupplierOrderReservationRow = {
    reservation_id: number;
    order_id: number;
    product_id: number;
    variant_id: number;
    product_name: string | null;
    variant_title: string | null;
    qty: number;
    reserved_at: string | null;
    supplier_name: string | null;
    supplier_product_name: string | null;
    supplier_code: string | null;
    supplier_price: string | null;
};

export type SupplierOrderReservationsResponse = {
    data: SupplierOrderReservationRow[];
    current_page: number;
    last_page: number;
    total: number;
};

export async function fetchWarehouseSuppliers(): Promise<WarehouseSuppliersResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/suppliers/options`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Warehouse suppliers API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchWarehouses(): Promise<WarehouseOptionsResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/warehouses/options`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Warehouse options API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockReceipts(params?: {
    page?: number;
    search?: string;
    warehouse_id?: number;
}): Promise<StockReceiptsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    if (params?.warehouse_id) {
        searchParams.set("warehouse_id", String(params.warehouse_id));
    }

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/receipts${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock receipts API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockReceipt(id: number | string): Promise<StockReceiptDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock receipt detail API error: ${res.status}`);
    }

    return res.json();
}

export async function createStockReceipt(payload: StockReceiptPayload): Promise<{ message?: string; data: StockReceiptListItem }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create stock receipt API error: ${res.status}`);
    }

    return res.json();
}

export async function updateStockReceipt(
    id: number | string,
    payload: StockReceiptPayload
): Promise<{ message?: string; data: StockReceiptListItem }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update stock receipt API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteStockReceipt(id: number | string): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete stock receipt API error: ${res.status}`);
    }

    return res.json();
}

export async function prepareStockReceiptXlsImport(file: File): Promise<StockReceiptImportXlsPrepareResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/prepare`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
        body: formData,
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Prepare stock receipt XLS API error: ${res.status}`);
    }

    return res.json() as Promise<StockReceiptImportXlsPrepareResponse>;
}

export async function resolveStockReceiptXlsImportBatch(payload: {
    session_id: string;
    offset: number;
    limit?: number;
}): Promise<StockReceiptImportXlsResolveBatchResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/resolve-batch`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
            session_id: payload.session_id,
            offset: payload.offset,
            limit: payload.limit ?? 75,
        }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Resolve stock receipt XLS batch API error: ${res.status}`);
    }

    return res.json() as Promise<StockReceiptImportXlsResolveBatchResponse>;
}

export async function commitStockReceiptXlsImport(
    payload: StockReceiptImportXlsCommitPayload
): Promise<StockReceiptImportXlsCommitResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/commit`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Commit stock receipt XLS API error: ${res.status}`);
    }

    return res.json() as Promise<StockReceiptImportXlsCommitResponse>;
}

export async function clearStockReceiptXlsImportReceiptTarget(sessionId: string): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/clear-receipt`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ session_id: sessionId }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Clear stock receipt XLS session API error: ${res.status}`);
    }

    return res.json() as Promise<{ message?: string }>;
}

export async function fetchStockReceiptXlsImportState(): Promise<{ data: StockReceiptImportXlsState | null }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/state`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch stock receipt XLS import state API error: ${res.status}`);
    }

    return res.json() as Promise<{ data: StockReceiptImportXlsState | null }>;
}

export async function saveStockReceiptXlsImportState(payload: StockReceiptImportXlsState): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls/state`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Save stock receipt XLS import state API error: ${res.status}`);
    }

    return res.json() as Promise<{ message?: string }>;
}

export async function postStockReceipt(id: number | string): Promise<{ message?: string; data: StockReceiptListItem }> {
    const res = await fetch(`${API_BASE}/admin/stock/receipts/${id}/post`, {
        method: "POST",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Post stock receipt API error: ${res.status}`);
    }

    return res.json() as Promise<{ message?: string; data: StockReceiptListItem }>;
}

export async function importStockReceiptXls(
    payload: StockReceiptImportXlsPayload
): Promise<{ message?: string; data: StockReceiptListItem }> {
    const formData = new FormData();
    formData.append("file", payload.file);
    if (typeof payload.warehouse_id === "number") formData.append("warehouse_id", String(payload.warehouse_id));
    if (typeof payload.supplier_id === "number") formData.append("supplier_id", String(payload.supplier_id));
    if (payload.supplier_code) formData.append("supplier_code", payload.supplier_code);
    if (payload.supplier_name) formData.append("supplier_name", payload.supplier_name);
    if (payload.received_at) formData.append("received_at", payload.received_at);
    if (payload.comment) formData.append("comment", payload.comment);
    if (payload.mapping?.length) {
        payload.mapping.forEach((row, index) => {
            if (row.map_key) formData.append(`mapping[${index}][map_key]`, row.map_key);
            if (row.code) formData.append(`mapping[${index}][code]`, row.code);
            if (row.title) formData.append(`mapping[${index}][title]`, row.title);
            if (typeof row.variant_id === "number") formData.append(`mapping[${index}][variant_id]`, String(row.variant_id));
            if (typeof row.selected_variant_id === "number") {
                formData.append(`mapping[${index}][selected_variant_id]`, String(row.selected_variant_id));
            }
        });
    }

    const res = await fetch(`${API_BASE}/admin/stock/receipts/import-xls`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
        body: formData,
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Import stock receipt XLS API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockWriteoffs(params?: {
    page?: number;
    search?: string;
    type?: string;
    warehouse_id?: number;
}): Promise<StockWriteoffsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    if (params?.type) {
        searchParams.set("type", params.type);
    }
    if (params?.warehouse_id) {
        searchParams.set("warehouse_id", String(params.warehouse_id));
    }

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/writeoffs${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock writeoffs API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockWriteoff(id: number): Promise<StockWriteoffDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/stock/writeoffs/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock writeoff API error: ${res.status}`);
    }

    return res.json();
}

export async function reverseStockWriteoff(id: number): Promise<{ message?: string; data: StockWriteoffListItem }> {
    const res = await fetch(`${API_BASE}/admin/stock/writeoffs/${id}/reverse`, {
        method: "POST",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Reverse stock writeoff API error: ${res.status}`);
    }

    return res.json();
}

export async function createStockWriteoff(
    payload: StockWriteoffPayload
): Promise<{ message?: string; data: StockWriteoffListItem }> {
    const res = await fetch(`${API_BASE}/admin/stock/writeoffs`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create stock writeoff API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockBalances(params?: {
    page?: number;
    search?: string;
    stock_state?: string;
    warehouse_id?: number;
}): Promise<StockBalancesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    if (params?.stock_state) {
        searchParams.set("stock_state", params.stock_state);
    }
    if (params?.warehouse_id) {
        searchParams.set("warehouse_id", String(params.warehouse_id));
    }

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/balances${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock balances API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockReceiptsReport(params?: {
    page?: number;
    date_from?: string;
    date_to?: string;
    supplier_code?: string;
    supplier_id?: number;
    product_id?: number;
    warehouse_id?: number;
}): Promise<StockReportReceiptsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    if (params?.supplier_code) searchParams.set("supplier_code", params.supplier_code);
    if (params?.supplier_id) searchParams.set("supplier_id", String(params.supplier_id));
    if (params?.product_id) searchParams.set("product_id", String(params.product_id));
    if (params?.warehouse_id) searchParams.set("warehouse_id", String(params.warehouse_id));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/reports/receipts${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock receipts report API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockWriteoffsReport(params?: {
    page?: number;
    date_from?: string;
    date_to?: string;
    type?: string;
    product_id?: number;
    warehouse_id?: number;
}): Promise<StockReportWriteoffsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.product_id) searchParams.set("product_id", String(params.product_id));
    if (params?.warehouse_id) searchParams.set("warehouse_id", String(params.warehouse_id));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/reports/writeoffs${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock writeoffs report API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchStockSalesReport(params?: {
    date_from?: string;
    date_to?: string;
    report_by?: "orders" | "products";
    group_by?: "day" | "month" | "year";
    product_id?: number;
    product_ids?: number[];
    warehouse_id?: number;
}): Promise<StockSalesReportResponse> {
    const searchParams = new URLSearchParams();
    if (params?.report_by) searchParams.set("report_by", params.report_by);
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    if (params?.group_by) searchParams.set("group_by", params.group_by);
    if (params?.product_id) searchParams.set("product_id", String(params.product_id));
    if (params?.product_ids?.length) {
        params.product_ids.forEach((id) => searchParams.append("product_ids[]", String(id)));
    }
    if (params?.warehouse_id) searchParams.set("warehouse_id", String(params.warehouse_id));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/reports/sales${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Stock sales report API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchSupplierOrderReservationsReport(params?: {
    page?: number;
    product_id?: number;
}): Promise<SupplierOrderReservationsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.product_id) searchParams.set("product_id", String(params.product_id));

    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/stock/reports/order-reservations${query ? `?${query}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Supplier order reservations report API error: ${res.status}`);
    }

    return res.json();
}
