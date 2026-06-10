import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

/** /search не в disallow: индексация отключается meta robots (см. searchRouteMetadata). */

const SEO_ALLOW_INDEX = process.env.NEXT_PUBLIC_SEO_ALLOW_INDEX === "true";

export default function robots(): MetadataRoute.Robots {
    if (!SEO_ALLOW_INDEX) {
        return {
            rules: {
                userAgent: "*",
                disallow: "/",
            },
        };
    }

    const base = getSiteUrl();

    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/cart", "/checkout", "/account", "/login", "/wishlist"],
        },
        sitemap: `${base}/sitemap.xml`,
    };
}
