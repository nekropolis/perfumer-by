import { apiFetch } from "@/lib/api";
import type { CatalogBrandsResponse, ProductsResponse } from "@/types/catalog";
import { isExcludedFromPublicSitemap } from "@/lib/sitemap-policy";
import { getSiteUrl } from "@/lib/seo";

type PostsSlugResponse = {
    data: { slug: string; title?: string | null }[];
};

type SeoSitemapEntryType = "page" | "post" | "product" | "brand";

type SeoSitemapUrlsResponse = {
    data: {
        path: string;
        lastModified: string | null;
        type?: SeoSitemapEntryType;
        title?: string | null;
    }[];
};

export type BuiltSitemapEntryType = "static" | SeoSitemapEntryType;

export type BuiltSitemapEntry = {
    path: string;
    url: string;
    lastModified: Date;
    priority: number;
    type: BuiltSitemapEntryType;
    title: string | null;
};

/** Статические разделы, всегда добавляемые в sitemap (совпадает с HTML «Разделы»). */
export const SITEMAP_STATIC_PATHS: { path: string; priority: number; title: string }[] = [
    { path: "/", priority: 1, title: "Главная" },
    { path: "/catalog", priority: 0.9, title: "Каталог" },
    { path: "/catalog?sale=1", priority: 0.85, title: "Акции" },
    { path: "/catalog?new=1", priority: 0.85, title: "Новинки" },
    { path: "/catalog?hit=1", priority: 0.85, title: "Хиты" },
    { path: "/catalog?gender=female", priority: 0.85, title: "Женская парфюмерия" },
    { path: "/catalog?gender=male", priority: 0.85, title: "Мужская парфюмерия" },
    { path: "/catalog?gender=unisex", priority: 0.8, title: "Унисекс парфюмерия" },
    { path: "/brands", priority: 0.85, title: "Бренды" },
    { path: "/articles", priority: 0.85, title: "Статьи" },
    { path: "/news", priority: 0.85, title: "Новости" },
    { path: "/reviews", priority: 0.85, title: "Отзывы о магазине" },
    { path: "/contacts", priority: 0.8, title: "Контакты" },
    { path: "/gift-certificates", priority: 0.7, title: "Подарочные сертификаты" },
];

function priorityForType(type: BuiltSitemapEntryType, path: string): number {
    if (type === "static") {
        return SITEMAP_STATIC_PATHS.find((s) => s.path === path)?.priority ?? 0.6;
    }
    if (type === "brand") return 0.75;
    if (type === "product") return 0.65;
    return 0.6;
}

function inferTypeFromPath(path: string): BuiltSitemapEntryType {
    if (path.startsWith("/brands/")) return "brand";
    return "product";
}

/**
 * Единый источник URL для XML sitemap и HTML «Карта сайта».
 * Кеш payload: Laravel Redis (`SeoSitemapService`). Route-level ISR — на `/sitemap` и `/sitemap.xml`.
 */
export async function buildSitemapEntries(): Promise<BuiltSitemapEntry[]> {
    const base = getSiteUrl().replace(/\/$/, "");
    const now = new Date();

    const entries: BuiltSitemapEntry[] = [];
    const seenPaths = new Set<string>();

    const pushPath = (
        path: string,
        lastModified: Date,
        type: BuiltSitemapEntryType,
        title: string | null,
        priority?: number,
    ) => {
        const normalized = path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
        if (isExcludedFromPublicSitemap(normalized)) return;
        if (seenPaths.has(normalized)) return;
        seenPaths.add(normalized);
        const url = normalized === "/" ? `${base}/` : `${base}${normalized}`;
        entries.push({
            path: normalized,
            url,
            lastModified,
            priority: priority ?? priorityForType(type, normalized),
            type,
            title,
        });
    };

    for (const { path, priority, title } of SITEMAP_STATIC_PATHS) {
        pushPath(path, now, "static", title, priority);
    }

    let usedAggregateEndpoint = false;
    try {
        const aggregate = await apiFetch<SeoSitemapUrlsResponse>("/seo/sitemap-urls");
        for (const row of aggregate.data ?? []) {
            if (!row.path?.trim()) continue;
            const path = row.path.startsWith("/") ? row.path : `/${row.path}`;
            const lm = row.lastModified ? new Date(row.lastModified) : now;
            const type = row.type ?? inferTypeFromPath(path);
            const title = row.title?.trim() || null;
            pushPath(path, lm, type, title);
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
                pushPath(`/brands/${b.slug}`, now, "brand", b.name?.trim() || null);
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
                    pushPath(`/${p.slug}`, now, "product", p.name?.trim() || null);
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
                    pushPath(`/${row.slug}`, now, "post", row.title?.trim() || null);
                }
            } catch {
                /* */
            }
        }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path, "ru"));

    return entries;
}
