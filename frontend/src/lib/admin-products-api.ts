import { getAuthToken } from "@/lib/auth-token";
import { formatMoneyRub } from "@/lib/format-money-display";

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

/** Headers for same-origin Next revalidate — do NOT use Authorization (breaks nginx basic auth). */
function getStorefrontRevalidateHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { "X-Admin-Authorization": `Bearer ${token}` } : {}),
    };
}

export type ProductAdminItem = {
    id: number;
    name: string;
    slug: string;
    matched_variant_ids?: number[];
    is_active: boolean;
    is_new: boolean;
    is_hit: boolean;
    discounted_variants_count?: number;
    is_out_of_stock?: boolean;
    variants_count: number;
    /** Варианты с остатком на «наших» полках или предзаказом (см. ProductAdminController). */
    variants_with_stock_count?: number;
    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;
};

export type ProductsAdminResponse = {
    data: ProductAdminItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type ProductBrandOption = {
    id: number;
    name: string;
    slug: string;
};

export type ProductSmartSearchVariantPreview = {
    id?: number;
    title: string;
    /** Канал отгрузки (ProductVariantResource::adminFulfillmentTooltip на бэке). */
    fulfillment_tooltip: string;
    available_stock: number;
    is_available: boolean;
    is_preorder: boolean;
    price?: string | number | null;
    can_fulfill_main?: boolean;
    can_fulfill_offer?: boolean;
};

export type ProductSmartSearchFlatOption =
    | {
          kind: "variant";
          key: string;
          hit: ProductSmartSearchItem;
          variant: ProductSmartSearchVariantPreview;
      }
    | {
          kind: "no-variants";
          key: string;
          hit: ProductSmartSearchItem;
      };

/** Плоский список: по строке на вариант (или «нет вариантов»). */
export function flattenProductSmartSearchHits(hits: ProductSmartSearchItem[]): ProductSmartSearchFlatOption[] {
    const out: ProductSmartSearchFlatOption[] = [];
    for (const hit of hits) {
        const preview: ProductSmartSearchVariantPreview[] = hit.variants_preview?.length
            ? hit.variants_preview
            : (hit.variant_titles ?? []).map((title): ProductSmartSearchVariantPreview => ({
                  title,
                  fulfillment_tooltip: "",
                  available_stock: 0,
                  is_available: false,
                  is_preorder: false,
              }));
        if (preview.length === 0) {
            out.push({ kind: "no-variants", key: `p-${hit.id}-none`, hit });
            continue;
        }
        for (const variant of preview) {
            const variantKey = variant.id != null ? String(variant.id) : variant.title;
            out.push({
                kind: "variant",
                key: `p-${hit.id}-v-${variantKey}`,
                hit,
                variant,
            });
        }
    }
    return out;
}

export function productSmartSearchAvailabilityLabel(variant: ProductSmartSearchVariantPreview): string {
    const tip = variant.fulfillment_tooltip?.trim();
    if (tip) return tip;
    if (variant.is_preorder) return "предзаказ";
    if (variant.is_available) return "в наличии";
    return "нет в наличии";
}

export function productSmartSearchAvailabilityClass(variant: ProductSmartSearchVariantPreview): string {
    if (variant.is_preorder) return "text-amber-800";
    if (variant.is_available) return "text-emerald-800";
    return "text-admin-text-secondary";
}

export function productSmartSearchShowsPrice(variant: ProductSmartSearchVariantPreview): boolean {
    return variant.is_available || variant.is_preorder;
}

export function productSmartSearchPriceLabel(variant: ProductSmartSearchVariantPreview): string {
    const raw = variant.price;
    return raw != null && String(raw).trim() !== "" ? formatMoneyRub(raw) : "—";
}

export type ProductSmartSearchItem = {
    id: number;
    name: string;
    brand_name: string | null;
    variant_titles: string[];
    /** До 5 вариантов: название + канал отгрузки (см. CatalogProductLinkSearchService). */
    variants_preview?: ProductSmartSearchVariantPreview[];
    score: number;
};

export type ProductBrandsOptionsResponse = {
    data: ProductBrandOption[];
};

export type ProductSmartSearchResponse = {
    data: ProductSmartSearchItem[];
};

export type ProductAdminDetail = {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    is_new: boolean;
    is_hit: boolean;
    is_set?: boolean;
    is_out_of_stock?: boolean;
    h1?: string | null;
    short_description?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    seo_keyword?: string | null;

    /** Админ-метаданные импорта (расширение ответа GET /admin/products/:id). */
    is_legacy_for_import?: boolean;
    description_rewritten_at?: string | null;

    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;

    variants_count: number;

    set_components?: Array<{
        id?: number;
        volume_label: string;
        concentration_label: string;
        sort_order?: number;
    }>;

    variants?: Array<{
        id: number;
        title: string;
        display_name?: string;
        volume?: number | null;
        volume_unit?: string | null;
        type?: string | null;
        price?: string | number | null;
        old_price?: string | number | null;
        stock?: number;
        available_stock?: number;
        is_available?: boolean;
        is_preorder?: boolean;
        is_active?: boolean;
        /** Склад / поставщик — из ProductVariantResource (админка). */
        fulfillment_tooltip?: string;
        can_fulfill_main?: boolean;
        can_fulfill_offer?: boolean;
    }>;

    images?: Array<{
        id: number;
        path: string;
        is_main?: boolean;
        sort_order?: number;
        usage_type?: "gallery" | "catalog";
        watermark_status?: string;
    }>;

    attribute_values?: Array<{
        id: number;
        custom_value?: string | null;
        sort_order: number;
        attribute: {
            id: number;
            name: string;
            type: "text" | "select" | "multiselect";
            options?: Array<{
                id: number;
                name: string;
                sort_order: number;
            }>;
        } | null;
        selected_options?: Array<{
            id: number;
            name: string;
            sort_order: number;
        }>;
    }>;
};

export type ProductAdminDetailResponse = {
    data: ProductAdminDetail;
};

export type ProductSeoField =
    | "seo_description"
    | "short_description"
    | "description";

export type ProductSeoFieldState = {
    state: "new" | "generated" | "manually_changed";
    current: string | null;
};

export type ProductSeoGeneration = {
    id: number;
    product_id: number;
    status: "pending" | "submitted" | "polling" | "completed" | "failed" | "conflicted";
    external_status: "pending" | "researching" | "generating" | "completed" | "failed" | null;
    requested_fields: ProductSeoField[];
    result: Partial<Record<ProductSeoField, string>> | null;
    request_payload: Record<string, unknown>;
    raw_result: Record<string, unknown> | null;
    error: string | null;
    conflict: boolean;
    attempts: number;
    created_at: string | null;
    finished_at: string | null;
};

export type ProductSeoPreviewResponse = {
    data: {
        fields: Record<ProductSeoField, ProductSeoFieldState>;
        active_generation: ProductSeoGeneration | null;
    };
};

export type ProductSeoGenerationResponse = {
    message?: string;
    data: ProductSeoGeneration;
};

export type ProductVariantSupplierItem = {
    id: number;
    title: string;
    /** Витрина: флаг «Активен» на связке варианта. */
    is_active?: boolean;
    is_preorder?: boolean;
    is_promotion?: boolean;
    site_price?: number | string | null;
    old_price?: number | string | null;
    stock: number;
    /** Как на витрине (CatalogVariantStockPresenter::forListing). */
    available_stock?: number;
    is_available?: boolean;
    fulfillment_tooltip?: string;
    can_fulfill_main?: boolean;
    can_fulfill_offer?: boolean;
    warehouses: Array<{
        warehouse_name: string | null;
        stock: number;
        available_stock: number;
    }>;
    /** Склады без основного — для строк офферов поставщика (основной показывается в main_store_rows). */
    supplier_warehouses?: Array<{
        warehouse_name: string | null;
        stock: number;
        available_stock: number;
        /** Виртуальная полка по активному прайсу (без физической строки склада supplier). */
        virtual_price_channel?: boolean;
    }>;
    /** Приходы на основной склад: канал «Магазин», цена и количество из прихода. */
    main_store_rows?: Array<{
        lot_id?: number;
        receipt_item_id: number;
        receipt_id: number;
        receipt_document_no: string | null;
        supplier_name: string;
        supplier_code: string;
        supplier_product_name: string;
        supplier_price: number | string | null;
        warehouse_name: string | null;
        qty: number;
        received_at: string | null;
        comment?: string | null;
    }>;
    suppliers: Array<{
        offer_id: number;
        supplier_name: string | null;
        supplier_code: string | null;
        supplier_product_name: string | null;
        supplier_price: number | string | null;
    }>;
    receipt_batches: Array<{
        receipt_item_id: number;
        receipt_id: number;
        receipt_document_no: string | null;
        supplier_name: string | null;
        supplier_code: string | null;
        supplier_product_name: string | null;
        supplier_price: number | string | null;
        warehouse_name: string | null;
        qty: number;
        received_at: string | null;
    }>;
};

export type ProductVariantSuppliersResponse = {
    data: ProductVariantSupplierItem[];
};

export type ProductLinkSearchResponse = {
    data: ProductAdminItem[];
};

/**
 * Поиск товара для связи с прайсом: AND по значимым токенам (бэкенд CatalogProductLinkSearchService).
 */
export async function fetchProductLinkSearch(params: {
    q: string;
    brand_id?: number;
    limit?: number;
}): Promise<ProductLinkSearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.q.trim());
    if (params.brand_id != null && params.brand_id > 0) {
        searchParams.set("brand_id", String(params.brand_id));
    }
    if (params.limit != null) {
        searchParams.set("limit", String(params.limit));
    }
    const query = searchParams.toString();
    const res = await fetch(`${API_BASE}/admin/products/link-search?${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product link search API error: ${res.status}`);
    }
    return res.json();
}

export async function fetchProducts(params?: {
    search?: string;
    page?: number;
    brand_id?: number;
    out_of_stock?: "" | "1" | "0";
    status?: "" | "new" | "hit" | "discount";
}): Promise<ProductsAdminResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.brand_id) {
        searchParams.set("brand_id", String(params.brand_id));
    }
    if (params?.out_of_stock === "1" || params?.out_of_stock === "0") {
        searchParams.set("out_of_stock", params.out_of_stock);
    }
    if (params?.status) {
        searchParams.set("status", params.status);
    }

    const query = searchParams.toString();
    const url = `${API_BASE}/admin/products${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Products API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductBrandOptions(): Promise<ProductBrandsOptionsResponse> {
    const res = await fetch(`${API_BASE}/admin/products/brands/options`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product brands options API error: ${res.status}`);
    }

    return res.json();
}

export async function smartSearchProducts(params: {
    q: string;
    limit?: number;
}): Promise<ProductSmartSearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.q);
    if (params.limit) {
        searchParams.set("limit", String(params.limit));
    }
    const query = searchParams.toString();

    const res = await fetch(`${API_BASE}/admin/products/search-smart?${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product smart search API error: ${res.status}`);
    }

    return res.json();
}

/** Умный поиск; если fuzzy не дал строк — обычный поиск по каталогу админки (название / SKU в списке). */
export async function smartSearchProductsWithFallback(params: {
    q: string;
    limit?: number;
}): Promise<ProductSmartSearchResponse> {
    const q = params.q.trim();
    const limit = params.limit ?? 12;
    if (q.length < 2) {
        return { data: [] };
    }
    const smart = await smartSearchProducts({ q, limit });
    if (smart.data?.length) {
        return smart;
    }
    const page = await fetchProducts({ search: q, page: 1 });
    const rows = (page.data ?? []).slice(0, limit);
    if (rows.length === 0) {
        return { data: [] };
    }

    const details = await Promise.all(
        rows.map(async (p) => {
            try {
                const detail = await fetchProductById(p.id);
                return detail.data ?? null;
            } catch {
                return null;
            }
        }),
    );

    const mapped: ProductSmartSearchItem[] = rows.map((p, index) => {
        const detail = details[index];
        const variants = detail?.variants ?? [];
        const variantsPreview: ProductSmartSearchVariantPreview[] = variants.map((v) => ({
            id: v.id,
            title: (v.display_name ?? v.title ?? "").trim() || "—",
            fulfillment_tooltip: v.fulfillment_tooltip ?? "",
            available_stock: v.available_stock ?? v.stock ?? 0,
            is_available: Boolean(v.is_available),
            is_preorder: Boolean(v.is_preorder),
            price: v.price ?? null,
            can_fulfill_main: v.can_fulfill_main,
            can_fulfill_offer: v.can_fulfill_offer,
        }));

        return {
            id: p.id,
            name: p.name,
            brand_name: p.brand?.name ?? null,
            variant_titles: variantsPreview.map((v) => v.title),
            variants_preview: variantsPreview,
            score: 0.5,
        };
    });

    return { data: mapped };
}

export async function fetchProductById(id: number | string): Promise<ProductAdminDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product detail API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductSeoPreview(
    id: number,
    signal?: AbortSignal,
): Promise<ProductSeoPreviewResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/generate-seo/preview`, {
        headers: getAdminHeaders(),
        cache: "no-store",
        signal,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `SEO preview API error: ${res.status}`);
    }

    return res.json();
}

export async function startProductSeoGeneration(
    id: number,
    fields: Partial<Record<ProductSeoField, string | null>>,
    confirmManualChanges: boolean,
): Promise<ProductSeoGenerationResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/generate-seo`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
            fields,
            confirm_manual_changes: confirmManualChanges,
        }),
        cache: "no-store",
    });

    const text = await res.text();
    let parsed: (ProductSeoGenerationResponse & { message?: string }) | null = null;
    try {
        parsed = text ? JSON.parse(text) as ProductSeoGenerationResponse : null;
    } catch {
        parsed = null;
    }
    if (!res.ok) {
        throw new Error(parsed?.message || text || `SEO generation API error: ${res.status}`);
    }

    if (!parsed?.data) {
        throw new Error("SEO generation API returned an invalid response");
    }

    return parsed;
}

export async function fetchProductSeoGeneration(
    productId: number,
    generationId: number,
    signal?: AbortSignal,
): Promise<ProductSeoGenerationResponse> {
    const res = await fetch(
        `${API_BASE}/admin/products/${productId}/generate-seo/${generationId}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal,
        },
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `SEO generation status API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductVariantSuppliers(
    id: number,
    options?: { variantId?: number },
): Promise<ProductVariantSuppliersResponse> {
    const params = new URLSearchParams();
    if (options?.variantId != null && options.variantId > 0) {
        params.set("variant_id", String(options.variantId));
    }
    const query = params.toString();
    const res = await fetch(
        `${API_BASE}/admin/products/${id}/variant-suppliers${query ? `?${query}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        },
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product variant suppliers API error: ${res.status}`);
    }

    return res.json();
}

export async function createProduct(payload: {
    brand_id: number;
    name: string;
    slug: string;
    is_active?: boolean;
    is_new?: boolean;
    is_hit?: boolean;
    is_set?: boolean;
    set_components?: Array<{
        volume_label: string;
        concentration_label: string;
        sort_order?: number;
    }>;
    h1?: string;
    short_description?: string;
    description?: string;
    seo_title?: string;
    seo_description?: string;
    seo_keyword?: string;
}) {
    const res = await fetch(`${API_BASE}/admin/products`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create product API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProduct(
    id: number,
    payload: {
        brand_id: number;
        name: string;
        slug: string;
        is_active?: boolean;
        is_new?: boolean;
        is_hit?: boolean;
        is_set?: boolean;
        set_components?: Array<{
            volume_label: string;
            concentration_label: string;
            sort_order?: number;
        }>;
        h1?: string;
        short_description?: string;
        description?: string;
        seo_title?: string;
        seo_description?: string;
        seo_keyword?: string;
    }
) {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update product API error: ${res.status}`);
    }

    return res.json();
}

export type ProductSetAdminItem = {
    id: number;
    product_id: number;
    product_variant_link_id: number | null;
    title: string | null;
    sort_order: number;
    variant?: {
        id: number;
        display_name?: string | null;
        price?: string | number | null;
        is_active?: boolean;
    } | null;
    components: Array<{
        id?: number;
        volume_label: string;
        concentration_label: string;
        sort_order?: number;
    }>;
};

export async function fetchProductSets(productId: number | string): Promise<{ data: ProductSetAdminItem[] }> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/sets`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch product sets API error: ${res.status}`);
    }
    return res.json();
}

export async function createProductSet(
    productId: number | string,
    payload: { variant_definition_ids: number[]; title?: string },
): Promise<{ message?: string; data: ProductSetAdminItem }> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/sets`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create product set API error: ${res.status}`);
    }
    return res.json();
}

export async function updateProductSetItem(
    productId: number | string,
    setId: number,
    payload: {
        variant_definition_ids?: number[];
        set_components?: Array<{
            volume_label: string;
            concentration_label: string;
            sort_order?: number;
        }>;
        title?: string;
    },
): Promise<{ message?: string; data: ProductSetAdminItem }> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/sets/${setId}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update product set API error: ${res.status}`);
    }
    return res.json();
}

export async function deleteProductSet(
    productId: number | string,
    setId: number,
): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/sets/${setId}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product set API error: ${res.status}`);
    }
    return res.json();
}

export async function deleteProduct(id: number) {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product API error: ${res.status}`);
    }

    return res.json();
}

export type ResetCatalogCacheResult = {
    message: string;
    cache_version?: number;
    warmed?: boolean;
    storefront_revalidated?: boolean;
    storefront_revalidate_status?: "ok" | "skipped" | "failed";
    storefront_revalidate_message?: string | null;
    next_revalidated?: boolean;
};

function shortFetchError(status: number, body: string): string {
    const trimmed = body.trim();
    if (!trimmed) {
        return `HTTP ${status}`;
    }
    if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
        return `HTTP ${status} (HTML вместо JSON — проверьте путь revalidate)`;
    }
    try {
        const json = JSON.parse(trimmed) as { message?: string };
        if (typeof json.message === "string" && json.message.trim()) {
            return json.message.trim();
        }
    } catch {
        // plain text
    }
    return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

export async function resetCatalogApiCache(): Promise<ResetCatalogCacheResult> {
    const res = await fetch(`${API_BASE}/admin/products/cache/reset`, {
        method: "POST",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(shortFetchError(res.status, text) || `Reset catalog cache API error: ${res.status}`);
    }

    const backend = (await res.json()) as Omit<ResetCatalogCacheResult, "next_revalidated" | "message"> & {
        message?: string;
    };

    // Outside /api — nginx proxies /api to Laravel; this must hit Next.js.
    let nextRevalidated = false;
    let nextError: string | null = null;
    try {
        const nextRes = await fetch("/actions/revalidate-catalog", {
            method: "POST",
            headers: getStorefrontRevalidateHeaders(),
            cache: "no-store",
        });
        if (nextRes.ok) {
            nextRevalidated = true;
        } else {
            const text = await nextRes.text();
            nextError = shortFetchError(nextRes.status, text);
        }
    } catch (e) {
        nextError = e instanceof Error ? e.message : "Next revalidate failed";
    }

    const parts: string[] = [];
    parts.push(backend.warmed === false ? "Кеш каталога сброшен, прогрев с ошибкой" : "Кеш каталога сброшен и прогрет");
    if (nextRevalidated) {
        parts.push("витрина обновлена");
    } else if (nextError) {
        parts.push(`витрина не обновлена: ${nextError}`);
    } else if (backend.storefront_revalidate_status === "ok") {
        parts.push("витрина обновлена");
    }

    return {
        ...backend,
        message: parts.join(". "),
        next_revalidated: nextRevalidated,
    };
}

