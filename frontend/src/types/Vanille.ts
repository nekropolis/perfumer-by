export type SupplierProductItem = {
    id: number;
    external_name: string;
    external_slug: string | null;
    external_url: string;
    is_linked: boolean;
    is_active: boolean;
    last_seen_at: string | null;
    supplier?: {
        id: number;
        name: string;
        code: string;
    } | null;
    brand?: {
        id: number;
        name: string;
    } | null;
    product?: {
        id: number;
        name: string;
        slug: string;
    } | null;
};

export type ApiResponse = {
    data: SupplierProductItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type ImportResponse = {
    message?: string;
    imported?: number;
    updated?: number;
    errors?: number;
    items?: number;
    log?: string[];
    [key: string]: unknown;
};

export type VanilleParseResponse = {
    message?: string;
    log?: string[];
    done?: boolean;
    next_offset?: number;
    imported?: number;
    updated?: number;
    errors?: number;
    items?: number;
    [key: string]: unknown;
};

export type LaravelPaginator<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export type VanilleImportJobRow = {
    id: number;
    type: string;
    status: string;
    progress: number;
    message: string | null;
    error?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    created_at?: string | null;
};

export type VanilleImportJobLogRow = {
    id: number;
    vanille_import_job_id: number;
    level: string;
    message: string;
    context?: Record<string, unknown> | null;
    created_at: string;
};

export type VanilleImportQueueJob = {
    id: number;
    type:
        | "parse_brands"
        | "collect_links"
        | "parse_products"
        | "import_parsed_products"
        | "pipeline_new_products"
        | "pipeline_refresh_all";
    status: "pending" | "running" | "completed" | "failed";
    progress: number;
    message: string | null;
    result?: VanilleParseResponse | null;
    error?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    created_at?: string | null;
};

export type ParseJobConfig = {
    path: string;
    defaultError: string;
    paginated?: boolean;
    body?: Record<string, unknown>;
};

export type SupplierPricePreviewRow = {
    code: string;
    title: string;
    supplier_price: number | null;
    parsed: {
        brand: string | null;
        product_name: string | null;
        volume: number | null;
        concentration: string | null;
    };
    suggested_variant: {
        id: number;
        product_id: number;
        product_name: string | null;
        brand_name: string | null;
        display: string;
    } | null;
    selected_variant_id: number | null;
};

export type SupplierPricePreviewResponse = {
    message?: string;
    items: number;
    matched: number;
    unmatched: number;
    inserted?: number;
    updated?: number;
    skipped_linked?: number;
    offset?: number;
    limit?: number;
    total_rows?: number;
    processed?: number;
    done?: boolean;
    next_offset?: number;
    rows: SupplierPricePreviewRow[];
};

export type SellerOneParseStartResponse = {
    message?: string;
    job_id: string;
};

export type SellerOneParseStatus = {
    job_id: string;
    status: "queued" | "running" | "completed" | "failed";
    processed?: number;
    total_rows?: number;
    matched?: number;
    inserted?: number;
    updated?: number;
    skipped_linked?: number;
    message?: string;
    updated_at?: string;
};

export type SupplierPriceApplyResponse = {
    message?: string;
    linked: number;
    skipped: number;
    errors: number;
    items: number;
    log?: string[];
};

export type SellerOneSupplierProductItem = {
    id: number;
    external_name: string;
    external_slug: string | null;
    external_url: string;
    is_linked: boolean;
    is_active: boolean;
    last_seen_at: string | null;
    code: string;
    supplier_price: number | null;
    parsed: {
        brand?: string | null;
        product_name?: string | null;
        volume?: number | null;
        concentration?: string | null;
        is_tester?: boolean;
    } | null;
    is_new: boolean;
    match_confidence: number;
    match_confidence_breakdown?: {
        total: number;
        name_percent: number;
        name_points: number;
        volume_match: boolean;
        volume_points: number;
        concentration_match: boolean;
        concentration_points: number;
        // Tester-тай-брейкер: совпадение флага is_tester даёт +6 поверх vol/conc.
        // Бэк всегда присылает эти поля, держим optional для обратной совместимости
        // со старыми payload-ами, сохранёнными до ввода поля.
        tester_match?: boolean;
        tester_points?: number;
    } | null;
    status: "confirmed" | "found_unconfirmed" | "new" | "unlinked";
    brand?: {
        id: number;
        name: string;
    } | null;
    product?: {
        id: number;
        name: string;
        slug: string;
    } | null;
    suggested_variant?: {
        id: number;
        product_id: number;
        product_name: string | null;
        brand_name: string | null;
        display: string;
    } | null;
    // Продукт-кандидат без варианта: матч по имени сработал (80% точный / 70% частичный),
    // но подходящего варианта нет. UI предлагает «Создать вариант».
    suggested_product?: {
        id: number;
        name: string;
        slug: string | null;
        brand_name: string | null;
        variants_count: number;
    } | null;
    linked_variant?: {
        id: number;
        product_id: number;
        product_name: string | null;
        brand_name: string | null;
        display: string;
    } | null;
};

export type SellerOneSupplierProductsResponse = {
    data: SellerOneSupplierProductItem[];
    current_page: number;
    last_page: number;
    total: number;
    stats: {
        confirmed: number;
        found_unconfirmed: number;
        new: number;
        unlinked: number;
    };
};

export type SellerOneMatchRule = {
    id: number;
    supplier_id: number;
    pattern: string;
    replacement: string;
    is_active: boolean;
    sort_order: number;
};

export type SellerOnePricingSettings = {
    price_markup: number;
    price_rate: number;
    price_fixed_fee: number;
    price_intermediate_precision: number;
    price_final_precision: number;
};