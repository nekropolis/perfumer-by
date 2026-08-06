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
    const gender = sp?.gender ? String(sp.gender) : "";
    const tester = sp?.tester ? String(sp.tester) : "";
    const miniature = sp?.miniature ? String(sp.miniature) : "";
    const set = sp?.set ? String(sp.set) : "";

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
    if (gender === "female") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.female));
    } else if (gender === "male") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.male));
    } else if (gender === "unisex") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.unisex));
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
    if (tester === "1") {
        query.set("tester", "1");
    }
    if (miniature === "1") {
        query.set("miniature", "1");
    }
    if (set === "1") {
        query.set("set", "1");
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
    const sale = sp?.sale ? String(sp.sale) : "";
    const isNew = sp?.new ? String(sp.new) : "";
    const isHit = sp?.hit ? String(sp.hit) : "";
    const gender = sp?.gender ? String(sp.gender) : "";
    const tester = sp?.tester ? String(sp.tester) : "";
    const miniature = sp?.miniature ? String(sp.miniature) : "";
    const set = sp?.set ? String(sp.set) : "";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("brand_slug", slug);
    query.set("sort", sort);
    if (sale) {
        query.set("sale", sale);
    }
    if (isNew) {
        query.set("new", isNew);
    }
    if (isHit) {
        query.set("hit", isHit);
    }
    if (gender === "female") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.female));
    } else if (gender === "male") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.male));
    } else if (gender === "unisex") {
        query.set("attr_2", String(CATALOG_GENDER_OPTION_IDS.unisex));
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
    if (tester === "1") {
        query.set("tester", "1");
    }
    if (miniature === "1") {
        query.set("miniature", "1");
    }
    if (set === "1") {
        query.set("set", "1");
    }
    for (const [key, value] of Object.entries(sp || {})) {
        if (!key.startsWith("attr_") || !value) {
            continue;
        }
        // gender chip already maps to attr_2 — don't overwrite with empty/conflict from URL
        if (key === "attr_2" && (gender === "female" || gender === "male" || gender === "unisex")) {
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

/** Параметры разделов меню (Новинки / Хиты / Акции / пол), не путать с фильтрами каталога. */
export const CATALOG_MENU_QUERY_PARAMS = ["new", "hit", "sale", "gender"] as const;

export type CatalogMenuQueryParam = (typeof CATALOG_MENU_QUERY_PARAMS)[number];

/** product_attributes.id — «Для кого» */
export const CATALOG_GENDER_ATTRIBUTE_ID = 2;

export const CATALOG_GENDER_BUCKETS = ["female", "male", "unisex"] as const;

export type CatalogGenderBucket = (typeof CATALOG_GENDER_BUCKETS)[number];

export const CATALOG_GENDER_OPTION_IDS: Record<CatalogGenderBucket, number> = {
    female: 2,
    male: 27,
    unisex: 62,
};

const CATALOG_GENDER_OPTION_ID_TO_BUCKET = Object.fromEntries(
    Object.entries(CATALOG_GENDER_OPTION_IDS).map(([bucket, optionId]) => [optionId, bucket]),
) as Record<number, CatalogGenderBucket>;

export function getCatalogGenderBucketByOptionId(optionId: number): CatalogGenderBucket | null {
    return CATALOG_GENDER_OPTION_ID_TO_BUCKET[optionId] ?? null;
}

export function getActiveCatalogGender(
    searchParams: Pick<URLSearchParams, "get">,
): CatalogGenderBucket | null {
    const gender = searchParams.get("gender");
    if (gender === "female" || gender === "male" || gender === "unisex") {
        return gender;
    }

    const attrValue = searchParams.get(`attr_${CATALOG_GENDER_ATTRIBUTE_ID}`);
    if (!attrValue) {
        return null;
    }

    const optionIds = attrValue
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

    if (optionIds.length !== 1) {
        return null;
    }

    return getCatalogGenderBucketByOptionId(optionIds[0]!);
}

const CATALOG_NON_FACET_QUERY_KEYS = new Set<string>([
    "page",
    "sort",
    "brand_slug",
    ...CATALOG_MENU_QUERY_PARAMS,
]);

export function getActiveCatalogMenuParam(
    searchParams: Pick<URLSearchParams, "get">,
): CatalogMenuQueryParam | null {
    for (const key of CATALOG_MENU_QUERY_PARAMS) {
        if (key === "gender") {
            return getActiveCatalogGender(searchParams) ? key : null;
        }

        if (searchParams.get(key) === "1") {
            return key;
        }
    }

    return null;
}

export type CatalogSectionChip = "all" | "female" | "male" | "unisex" | "sale" | "new" | "hit";

export function getActiveCatalogSectionChip(
    searchParams: Pick<URLSearchParams, "get">,
): CatalogSectionChip {
    if (searchParams.get("sale") === "1") {
        return "sale";
    }
    if (searchParams.get("hit") === "1") {
        return "hit";
    }
    if (searchParams.get("new") === "1") {
        return "new";
    }

    const gender = getActiveCatalogGender(searchParams);
    if (gender) {
        return gender;
    }

    return "all";
}

export function buildCatalogSectionChipPath(
    basePath: string,
    searchParams: Pick<URLSearchParams, "get">,
    chip: CatalogSectionChip,
): string {
    const params = new URLSearchParams();
    const sort = searchParams.get("sort");
    if (sort && sort !== "popular") {
        params.set("sort", sort);
    }

    if (chip === "female" || chip === "male" || chip === "unisex") {
        params.set("gender", chip);
    } else if (chip === "sale") {
        params.set("sale", "1");
    } else if (chip === "hit") {
        params.set("hit", "1");
    } else if (chip === "new") {
        params.set("new", "1");
    }

    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
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

    // Акции / Новинки / Хиты — разделы меню: сброс фасетов их сохраняет.
    // gender («Для кого») — и раздел, и фильтр: сброс должен его очищать
    // (иначе /catalog?gender=female → attr_2 → reset снова ставит gender).
    if (menuParam === "sale" || menuParam === "new" || menuParam === "hit") {
        return buildCatalogSectionChipPath(basePath, searchParams, menuParam);
    }

    const params = new URLSearchParams();
    const sort = searchParams.get("sort");
    if (sort && sort !== "popular") {
        params.set("sort", sort);
    }

    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
}
