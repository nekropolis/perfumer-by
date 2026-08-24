import { apiFetch, type ApiFetchOptions } from "@/lib/api";
import { getAuthToken } from "@/lib/auth-token";
import type {
    CatalogBrandDetailResponse,
    CatalogBrandsResponse,
    CatalogFiltersResponse,
    ProductDetailResponse,
    ProductListItem,
    ProductsResponse,
} from "@/types/catalog";
import type { SearchResponse } from "@/types/search";

const CATALOG_FETCH: Record<CatalogFetchProfile, ApiFetchOptions> = {
    products: { next: { revalidate: 60, tags: ["catalog", "catalog-products"] } },
    brands: { next: { revalidate: 300, tags: ["catalog", "catalog-brands"] } },
    brandDetail: { next: { revalidate: 300, tags: ["catalog", "catalog-brand-detail"] } },
    filters: { next: { revalidate: 300, tags: ["catalog", "catalog-filters"] } },
    productDetail: { next: { revalidate: 60, tags: ["catalog", "catalog-product-detail"] } },
    bootstrap: { next: { revalidate: 300, tags: ["catalog", "catalog-bootstrap"] } },
    smartSearch: { next: { revalidate: 120, tags: ["catalog", "catalog-search"] } },
};

export type CatalogFetchProfile =
    | "products"
    | "brands"
    | "brandDetail"
    | "filters"
    | "productDetail"
    | "bootstrap"
    | "smartSearch";

export function catalogApiFetch<T>(path: string, profile: CatalogFetchProfile): Promise<T> {
    return apiFetch<T>(path, CATALOG_FETCH[profile]);
}

export function fetchCatalogProducts(queryString: string): Promise<ProductsResponse> {
    return catalogApiFetch<ProductsResponse>(`/catalog/products?${queryString}`, "products");
}

export function fetchCatalogBrands(): Promise<CatalogBrandsResponse> {
    return catalogApiFetch<CatalogBrandsResponse>("/catalog/brands", "brands");
}

export function fetchCatalogBrandDetail(slug: string): Promise<CatalogBrandDetailResponse> {
    return catalogApiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${slug}`, "brandDetail");
}

export function fetchCatalogFilters(filtersQueryString: string): Promise<CatalogFiltersResponse> {
    return catalogApiFetch<CatalogFiltersResponse>(
        `/catalog/filters${filtersQueryString ? `?${filtersQueryString}` : ""}`,
        "filters",
    );
}

export function fetchCatalogProductDetail(slug: string): Promise<ProductDetailResponse> {
    return catalogApiFetch<ProductDetailResponse>(`/catalog/products/${slug}`, "productDetail");
}

export function fetchHomeRecommendedProducts(): Promise<{
    data: ProductListItem[];
    hero: ProductListItem | null;
}> {
    return catalogApiFetch<{ data: ProductListItem[]; hero: ProductListItem | null }>(
        "/catalog/home/recommended",
        "products",
    ).then((res) => ({
        data: Array.isArray(res.data) ? res.data : [],
        hero: res.hero ?? null,
    }));
}

export function recordCatalogProductView(productId: number): void {
    if (productId <= 0) {
        return;
    }

    const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!base) {
        return;
    }

    const token = typeof window !== "undefined" ? getAuthToken() : "";

    void fetch(`${base}/catalog/products/${productId}/view`, {
        method: "POST",
        keepalive: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
}

export type CatalogBootstrapResponse = {
    data: {
        products: ProductsResponse;
        brands: CatalogBrandsResponse;
        filters: CatalogFiltersResponse;
        brand?: CatalogBrandDetailResponse;
    };
};

export function fetchCatalogBootstrap(queryString: string): Promise<CatalogBootstrapResponse> {
    return catalogApiFetch<CatalogBootstrapResponse>(
        `/catalog/bootstrap${queryString ? `?${queryString}` : ""}`,
        "bootstrap",
    );
}

export function fetchCatalogSmartSearch(queryString: string): Promise<SearchResponse> {
    return catalogApiFetch<SearchResponse>(`/catalog/products/smart-search?${queryString}`, "smartSearch");
}
