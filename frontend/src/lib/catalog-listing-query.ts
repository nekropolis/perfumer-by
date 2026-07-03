/**
 * Единая сборка query для `GET /catalog/products` — страницы каталога и SEO `generateMetadata`.
 */

export function buildCatalogProductsQuery(sp: Record<string, string | undefined>): URLSearchParams {
    const currentPage = Math.max(1, Number(sp?.page || "1") || 1);
    const brand = sp?.brand ? String(sp.brand) : "";
    const sort = sp?.sort ? String(sp.sort) : "popular";
    const priceMin = sp?.price_min ? String(sp.price_min) : "";
    const priceMax = sp?.price_max ? String(sp.price_max) : "";
    const volume = sp?.volume ? String(sp.volume) : "";
    const sale = sp?.sale ? String(sp.sale) : "";
    const isNew = sp?.new ? String(sp.new) : "";
    const isHit = sp?.hit ? String(sp.hit) : "";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("sort", sort);
    if (brand) {
        query.set("brand", brand);
    }
    if (sale) {
        query.set("sale", sale);
    }
    if (isNew) {
        query.set("new", isNew);
    }
    if (isHit) {
        query.set("hit", isHit);
    }
    if (priceMin) {
        query.set("price_min", priceMin);
    }
    if (priceMax) {
        query.set("price_max", priceMax);
    }
    if (volume) {
        query.set("volume", volume);
    }
    for (const [key, value] of Object.entries(sp || {})) {
        if (!key.startsWith("attr_") || !value) {
            continue;
        }
        query.set(key, String(value));
    }
    return query;
}

export function buildBrandProductsQuery(slug: string, sp: Record<string, string | undefined>): URLSearchParams {
    const currentPage = Math.max(1, Number(sp?.page || "1") || 1);
    const sort = sp?.sort ? String(sp.sort) : "price_asc";
    const priceMin = sp?.price_min ? String(sp.price_min) : "";
    const priceMax = sp?.price_max ? String(sp.price_max) : "";
    const volume = sp?.volume ? String(sp.volume) : "";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("brand_slug", slug);
    query.set("sort", sort);
    if (priceMin) {
        query.set("price_min", priceMin);
    }
    if (priceMax) {
        query.set("price_max", priceMax);
    }
    if (volume) {
        query.set("volume", volume);
    }
    for (const [key, value] of Object.entries(sp || {})) {
        if (!key.startsWith("attr_") || !value) {
            continue;
        }
        query.set(key, String(value));
    }
    return query;
}

/** Копия query с другим `page` (rel prev/next). */
export function listingQueryWithPage(query: URLSearchParams, page: number): URLSearchParams {
    const next = new URLSearchParams(query.toString());
    next.set("page", String(page));
    return next;
}

/** Параметры разделов меню (Новинки / Хиты / Акции), не путать с фильтрами каталога. */
export const CATALOG_MENU_QUERY_PARAMS = ["new", "hit", "sale"] as const;

export type CatalogMenuQueryParam = (typeof CATALOG_MENU_QUERY_PARAMS)[number];

const CATALOG_NON_FACET_QUERY_KEYS = new Set<string>([
    "page",
    "sort",
    ...CATALOG_MENU_QUERY_PARAMS,
]);

export function getActiveCatalogMenuParam(
    searchParams: Pick<URLSearchParams, "get">,
): CatalogMenuQueryParam | null {
    for (const key of CATALOG_MENU_QUERY_PARAMS) {
        if (searchParams.get(key) === "1") {
            return key;
        }
    }

    return null;
}

export function isCatalogMenuSection(searchParams: Pick<URLSearchParams, "get">): boolean {
    return getActiveCatalogMenuParam(searchParams) !== null;
}

export function hasCatalogFacetedFilters(searchParams: Pick<URLSearchParams, "keys">): boolean {
    return Array.from(searchParams.keys()).some((key) => !CATALOG_NON_FACET_QUERY_KEYS.has(key));
}

export function buildCatalogFacetedFiltersResetPath(
    basePath: string,
    searchParams: Pick<URLSearchParams, "get">,
): string {
    const menuParam = getActiveCatalogMenuParam(searchParams);

    return menuParam ? `${basePath}?${menuParam}=1` : basePath;
}
