import type { ProductListItem } from "@/types/catalog";

export type SearchBrandItem = {
    id: number;
    name: string;
    slug: string;
    products_count: number;
    score?: number;
};

export type SearchResponse = {
    data: {
        brands: SearchBrandItem[];
        products: ProductListItem[];
        suggested_query?: string | null;
    };
    meta?: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
    };
    debug?: {
        query: string;
        normalized_query: string;
        tokens: string[];
        search_patterns: string[];
        product_pool_count: number;
        brand_result_count: number;
        product_result_count: number;
        search_backend?: string;
        search_backend_elapsed_ms?: number;
        total_elapsed_ms?: number;
    } | null;
};
