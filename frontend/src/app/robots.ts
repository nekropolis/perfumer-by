import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

/**
 * `/robots.txt` через App Router Metadata Route.
 * Не класть `public/robots.txt` — статика перебьёт генератор.
 *
 * Google: User-agent / Allow / Disallow / Sitemap (Host не поддерживается).
 * Яндекс: то же + Clean-param (в Metadata API Next нет — UTM лучше в Вебмастере).
 *
 * Preprod: NEXT_PUBLIC_SEO_ALLOW_INDEX ≠ true → Disallow: /
 * /search не в Disallow: закрыт meta noindex,follow (робот видит тег).
 */

const SEO_ALLOW_INDEX = process.env.NEXT_PUBLIC_SEO_ALLOW_INDEX === "true";

/** Prefix-match: `/admin` закрывает и `/admin`, и `/admin/...`. */
const DISALLOW_PRIVATE = [
    "/admin",
    "/cart",
    "/checkout",
    "/account",
    "/login",
    "/wishlist",
] as const;

export default function robots(): MetadataRoute.Robots {
    if (!SEO_ALLOW_INDEX) {
        return {
            rules: {
                userAgent: "*",
                disallow: "/",
            },
        };
    }

    return {
        rules: {
            userAgent: "*",
            // Allow по умолчанию для всего, что не в Disallow — явный Allow: / не обязателен.
            disallow: [...DISALLOW_PRIVATE],
        },
        sitemap: `${getSiteUrl()}/sitemap.xml`,
    };
}
