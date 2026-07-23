/**
 * Активность пункта шапки: pathname + query (для /catalog?new=1 и т.п.).
 */
import { getActiveCatalogGender } from "@/lib/catalog-listing-query";

/** Query-ключи, которые делают «Каталог» неактивным при совпадении path. */
const CATALOG_NAV_FACET_KEYS = ["new", "hit", "sale", "gender"] as const;

function hasCatalogNavFacet(searchParams: URLSearchParams): boolean {
    return CATALOG_NAV_FACET_KEYS.some((key) => {
        const value = searchParams.get(key);
        return value !== null && value !== "" && value !== "0";
    });
}

export function isHeaderNavLinkActive(
    href: string,
    pathname: string,
    searchParams: URLSearchParams,
): boolean {
    let link: URL;
    try {
        link = new URL(href, "http://perfumer.local");
    } catch {
        return false;
    }

    const linkPath = link.pathname.replace(/\/$/, "") || "/";
    const currentPath = pathname.replace(/\/$/, "") || "/";

    if (currentPath !== linkPath && !currentPath.startsWith(`${linkPath}/`)) {
        return false;
    }

    const linkGender = link.searchParams.get("gender");
    if (linkGender === "female" || linkGender === "male" || linkGender === "unisex") {
        return getActiveCatalogGender(searchParams) === linkGender;
    }

    const linkQueryKeys = [...link.searchParams.keys()];
    if (linkQueryKeys.length === 0) {
        // /catalog без query не должен быть active на /catalog?new=1 и т.п.
        if (linkPath === "/catalog") {
            return !hasCatalogNavFacet(searchParams);
        }
        return true;
    }

    for (const key of linkQueryKeys) {
        if (searchParams.get(key) !== link.searchParams.get(key)) {
            return false;
        }
    }

    return true;
}
