import { isSeoNoindexMatrixPath } from "@/lib/seo";

/**
 * Что не кладём в sitemap.xml / HTML-карту (Google Search Central):
 * служебные и приватные URL, страницы с noindex, страницы поиска с дублями.
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 */
export function isExcludedFromPublicSitemap(pathname: string): boolean {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const pathOnly = path.split("?")[0] ?? path;

    if (pathOnly === "/search") {
        return true;
    }

    return isSeoNoindexMatrixPath(pathOnly);
}
