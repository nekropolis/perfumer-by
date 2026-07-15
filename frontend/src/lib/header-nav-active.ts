/**
 * Активность пункта шапки: pathname + query (для /catalog?new=1 и т.п.).
 */
import { getActiveCatalogGender } from "@/lib/catalog-listing-query";

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
        return true;
    }

    for (const key of linkQueryKeys) {
        if (searchParams.get(key) !== link.searchParams.get(key)) {
            return false;
        }
    }

    return true;
}
