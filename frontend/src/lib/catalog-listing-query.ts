/**
 * Единая сборка query для `GET /catalog/products` — страницы каталога и SEO `generateMetadata`.
 */

export function buildCatalogProductsQuery(sp: Record<string, string | undefined>): URLSearchParams {
    const currentPage = Math.max(1, Number(sp?.page || "1") || 1);
    const brand = sp?.brand ? String(sp.brand) : "";
    const sort = sp?.sort ? String(sp.sort) : "price_asc";
    const priceMin = sp?.price_min ? String(sp.price_min) : "";
    const priceMax = sp?.price_max ? String(sp.price_max) : "";
    const volume = sp?.volume ? String(sp.volume) : "";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("sort", sort);
    if (brand) {
        query.set("brand", brand);
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
