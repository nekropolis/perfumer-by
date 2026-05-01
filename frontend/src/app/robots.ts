import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

/** /search не в disallow: индексация отключается meta robots (см. searchRouteMetadata). */

export default function robots(): MetadataRoute.Robots {
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
