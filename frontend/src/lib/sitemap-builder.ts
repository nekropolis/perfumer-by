import { apiFetch } from "@/lib/api";
import type { CatalogBrandsResponse, ProductsResponse } from "@/types/catalog";
import { isExcludedFromPublicSitemap } from "@/lib/sitemap-policy";
import { getSiteUrl } from "@/lib/seo";

type PostsSlugResponse = {
    data: { slug: string }[];
};

type SeoSitemapUrlsResponse = {
    data: { path: string; lastModified: string | null }[];
};

export type BuiltSitemapEntry = {
    path: string;
    url: string;
    lastModified: Date;
    priority: number;
};

function priorityForPath(path: string): number {
    if (path === "/" || path === "") return 1;
    if (path.startsWith("/brands/")) return 0.75;
    if (path.startsWith("/articles/")) return 0.6;
    if (path.startsWith("/news/")) return 0.6;
    if (path.startsWith("/reviews/")) return 0.6;
    if (path.startsWith("/gift-certificates/")) return 0.6;
    const knownPrefixes = ["/catalog", "/brands", "/articles", "/news", "/reviews", "/gift-certificates", "/admin", "/account", "/cart", "/checkout", "/login", "/search", "/sitemap"];
    const isProductPath = path.startsWith("/") && !knownPrefixes.some(p => path.startsWith(p + "/"));
    if (isProductPath) return 0.65;
    return 0.6;
}

/**
 * Единый источник URL для XML sitemap и HTML «Карта сайта».
 * Кеш: `getCachedSitemapEntries()` + `revalidate` на route.
 */
export async function buildSitemapEntries(): Promise<BuiltSitemapEntry[]> {
    const base = getSiteUrl().replace(/\/$/, "");
    const now = new Date();

    const entries: BuiltSitemapEntry[] = [];
    const seenPaths = new Set<string>();

    const pushPath = (path: string, lastModified: Date, priority: number) => {
        const normalized = path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
        if (isExcludedFromPublicSitemap(normalized)) return;
        if (seenPaths.has(normalized)) return;
        seenPaths.add(normalized);
        const url = normalized === "/" ? `${base}/` : `${base}${normalized}`;
        entries.push({
            path: normalized,
            url,
            lastModified,
            priority,
        });
    };

    const staticPaths: { path: string; priority: number }[] = [
        { path: "/", priority: 1 },
        { path: "/catalog", priority: 0.9 },
        { path: "/brands", priority: 0.85 },
        { path: "/articles", priority: 0.85 },
        { path: "/news", priority: 0.85 },
        { path: "/reviews", priority: 0.85 },
        { path: "/gift-certificates", priority: 0.7 },
    ];

    for (const { path, priority } of staticPaths) {
        pushPath(path, now, priority);
    }

    let usedAggregateEndpoint = false;
    try {
        const aggregate = await apiFetch<SeoSitemapUrlsResponse>("/seo/sitemap-urls");
        for (const row of aggregate.data ?? []) {
            if (!row.path?.trim()) continue;
            const path = row.path.startsWith("/") ? row.path : `/${row.path}`;
            const lm = row.lastModified ? new Date(row.lastModified) : now;
            pushPath(path, lm, priorityForPath(path));
        }
        usedAggregateEndpoint = true;
    } catch {
        /* Laravel недоступен */
    }

    if (!usedAggregateEndpoint) {
        try {
            const brands = await apiFetch<CatalogBrandsResponse>("/catalog/brands");
            for (const b of brands.data ?? []) {
                if (!b.slug) continue;
                pushPath(`/brands/${b.slug}`, now, 0.75);
            }
        } catch {
            /* */
        }

        try {
            let page = 1;
            let lastPage = 1;
            do {
                const res = await apiFetch<ProductsResponse>(`/catalog/products?page=${page}&sort=name_asc`);
                lastPage = res.meta?.last_page ?? 1;
                for (const p of res.data ?? []) {
                    if (!p.slug) continue;
                    pushPath(`/${p.slug}`, now, 0.65);
                }
                page += 1;
            } while (page <= lastPage);
        } catch {
            /* */
        }

        for (const type of ["article", "news"] as const) {
            try {
                const res = await apiFetch<PostsSlugResponse>(`/posts?type=${type}&limit=24`);
                for (const row of res.data ?? []) {
                    if (!row.slug) continue;
                    pushPath(`/${row.slug}`, now, 0.6);
                }
            } catch {
                /* */
            }
        }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path, "ru"));

    return entries;
}
