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

export type ParseJobConfig = {
    path: string;
    defaultError: string;
    paginated?: boolean;
    body?: Record<string, unknown>;
};