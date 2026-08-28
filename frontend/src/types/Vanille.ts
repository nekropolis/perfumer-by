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
        | "parse_catalog_images"
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
    in_stock?: boolean | null;
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
    skipped_parsing_inactive?: number;
    marked_absent_unlinked?: number;
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
    supplier_code?: string;
    supplier_name?: string;
};

export type SellerOneParseStatus = {
    job_id: string;
    /** Парсинг прайса (`parse`) или фоновое обновление цен связанных (`refresh_linked`). */
    job_type?: "parse" | "refresh_linked";
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    supplier_code?: string;
    supplier_name?: string;
    processed?: number;
    total_rows?: number;
    /** Для refresh_linked: число связанных строк каталога. */
    total_linked?: number;
    matched?: number;
    inserted?: number;
    updated?: number;
    skipped_linked?: number;
    skipped?: number;
    price_history_rows?: number;
    price_changed?: number;
    became_out_of_stock?: number;
    became_in_stock?: number;
    missing_codes?: number;
    deactivated_offers?: number;
    deactivated_variants?: number;
    /** Снято виртуальных строк склада «Поставщик» по вариантам без кода в файле */
    cleared_supplier_shelf_variants?: number;
    codes_in_price?: number;
    linked_products?: number;
    message?: string;
    updated_at?: string;
    parse_diagnostics?: SellerOneParseDiagnostics;
    listing_diagnostics?: SellerOneListingDiagnostics;
};

export type SellerOneParseDiagnosticVariantGroup = {
    variant_id: number;
    codes: string[];
    names: string[];
};

export type SellerOneDuplicateVariantLinkEntry = {
    code: string;
    name: string;
    supplier_product_id: number;
};

export type SellerOneDuplicateVariantLinkGroup = {
    variant_id: number;
    entries: SellerOneDuplicateVariantLinkEntry[];
};

export type SellerOneDuplicateVariantLinksResponse = {
    linked_rows: number;
    distinct_linked_variants: number;
    duplicate_variant_groups: number;
    duplicate_variant_extra_rows: number;
    groups: SellerOneDuplicateVariantLinkGroup[];
};

export type SellerOneParseDiagnosticFileCode = {
    code: string;
    occurrences: number;
};

export type SellerOneParseDiagnostics = {
    linked_rows: number;
    distinct_linked_variants: number;
    duplicate_variant_extra_rows: number;
    duplicate_variant_groups: number;
    duplicate_variant_samples: SellerOneParseDiagnosticVariantGroup[];
    duplicate_file_code_extra_rows: number;
    duplicate_file_code_samples: SellerOneParseDiagnosticFileCode[];
};

export type SellerOneListingDiagnosticSample = {
    code: string;
    variant_id: number;
    name?: string;
    first_code?: string;
    reasons?: string[];
};

export type SellerOneListingDiagnostics = {
    rows_updated?: number;
    became_in_stock?: number;
    in_stock_gap?: number;
    gap_duplicate_variant?: number;
    gap_already_listed?: number;
    gap_not_listed?: number;
    gap_became_out_of_stock?: number;
    gap_unexplained?: number;
    distinct_variants_updated: number;
    duplicate_variant_in_batch: number;
    already_listed_before_batch: number;
    not_listed_after_update: number;
    duplicate_variant_samples: SellerOneListingDiagnosticSample[];
    already_listed_samples: SellerOneListingDiagnosticSample[];
    not_listed_samples: SellerOneListingDiagnosticSample[];
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
    supplier?: {
        id: number;
        name: string;
        code: string;
    } | null;
    external_name: string;
    external_slug: string | null;
    external_url: string;
    is_linked: boolean;
    is_active: boolean;
    link_parsing_active: boolean;
    last_seen_at: string | null;
    code: string;
    supplier_price: number | null;
    price_file_in_stock: boolean | null;
    catalog_supplier_channel_available: boolean | null;
    parsed: {
        brand?: string | null;
        product_name?: string | null;
        volume?: number | null;
        volume_is_multipack?: boolean;
        volume_multipack_count?: number | null;
        volume_multipack_unit_ml?: number | null;
        concentration?: string | null;
        is_tester?: boolean;
        is_vial?: boolean;
        is_miniature?: boolean;
        is_set?: boolean;
    } | null;
    is_new: boolean;
    match_confidence: number;
    match_confidence_breakdown?: {
        total: number;
        name_percent: number;
        name_points: number;
        /** Уровень совпадения имени (бэкенд SellerOneVariantMatcher). */
        name_match_level?: "none" | "exact" | "exact_multiset" | "partial" | "catalog_extra";
        link_match_level?: "none" | "full" | "variant_extra" | "name_only";
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
    // Продукт-кандидат без варианта: матч по имени (80% exact / exact_multiset, 70% partial),
    // но подходящего варианта нет. UI предлагает «Создать вариант».
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
        parsing_inactive: number;
        last_price_apply_at: string | null;
        last_price_apply_file_name: string | null;
    };
    suppliers?: Array<{ id: number; name: string; code: string }>;
};

export type SellerOneMatchRule = {
    id: number;
    supplier_id: number;
    supplier?: {
        id: number;
        name: string;
        code: string;
    } | null;
    pattern: string;
    replacement: string;
    is_active: boolean;
    sort_order: number;
};

export type SellerOnePricingSettings = {
    price_markup: number;
    price_rate: number;
    price_fixed_fee: number;
    price_precision: number;
};