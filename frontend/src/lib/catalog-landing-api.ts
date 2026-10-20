import { apiFetch, isApiNotFoundError } from "@/lib/api";

export type CatalogLandingPublic = {
    id: number;
    slug: string;
    gender?: string | null;
    filters?: Record<string, number[]>;
    h1: string;
    seo_title: string;
    seo_description?: string | null;
    content?: string | null;
    is_active?: boolean;
    sort?: number;
};

export async function fetchCatalogLandingBySlug(slug: string): Promise<CatalogLandingPublic | null> {
    try {
        const data = await apiFetch<{ data?: CatalogLandingPublic }>(
            `/catalog/landings/${encodeURIComponent(slug)}`,
            { next: { revalidate: 300, tags: ["catalog", "catalog-landings"] } },
        );
        return data.data ?? null;
    } catch (e: unknown) {
        if (isApiNotFoundError(e)) {
            return null;
        }
        throw e;
    }
}

/** Базовые query-параметры листинга из посадочной (gender + attr_*). */
export function catalogLandingBaseSearchParams(
    landing: Pick<CatalogLandingPublic, "gender" | "filters">,
): Record<string, string> {
    const sp: Record<string, string> = {};
    const gender = landing.gender?.trim();
    if (gender === "female" || gender === "male" || gender === "unisex") {
        sp.gender = gender;
    }
    const filters = landing.filters ?? {};
    for (const [attrId, optionIds] of Object.entries(filters)) {
        if (!Array.isArray(optionIds) || optionIds.length === 0) {
            continue;
        }
        const ids = optionIds.map((id) => String(id)).filter(Boolean);
        if (ids.length > 0) {
            sp[`attr_${attrId}`] = ids.join(",");
        }
    }
    return sp;
}

export function mergeCatalogLandingSearchParams(
    landing: Pick<CatalogLandingPublic, "gender" | "filters">,
    urlSp: Record<string, string | undefined>,
): Record<string, string | undefined> {
    const base = catalogLandingBaseSearchParams(landing);
    return { ...base, ...urlSp };
}

export function catalogLandingCanonicalPath(slug: string, urlSp: Record<string, string | undefined>): string {
    const page = Math.max(1, Number(urlSp.page || "1") || 1);
    const base = `/catalog/${slug}`;
    return page > 1 ? `${base}?page=${page}` : base;
}
