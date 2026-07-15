import type { Metadata } from "next";
import type { ProductDetailData } from "@/types/catalog";
import { listingQueryWithPage } from "@/lib/catalog-listing-query";
import { normalizeProductImageUrl } from "@/lib/product-image-url";

/** Пока разработка: весь сайт в noindex, nofollow. Перед продом — `true` + проверить матрицу ниже. */
const SEO_ALLOW_INDEX =
    process.env.NEXT_PUBLIC_SEO_ALLOW_INDEX === "true";

/** Всегда noindex, nofollow (и при включённой индексации сайта). */
export const SEO_ROBOTS_NOINDEX_NOFOLLOW: NonNullable<Metadata["robots"]> = {
    index: false,
    follow: false,
};

/**
 * Маршруты, которые остаются noindex при `NEXT_PUBLIC_SEO_ALLOW_INDEX=true`.
 * Сегментные `layout.tsx` дублируют это через `matrixRouteMetadata()`.
 */
export function isSeoNoindexMatrixPath(pathname: string): boolean {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

    /** /search — отдельно `searchRouteMetadata()` (noindex, follow). */
    if (path === "/cart" || path === "/login" || path === "/wishlist") {
        return true;
    }
    if (path === "/account" || path.startsWith("/account/")) {
        return true;
    }
    if (path === "/checkout" || path.startsWith("/checkout/")) {
        return true;
    }
    if (path === "/admin" || path.startsWith("/admin/")) {
        return true;
    }
    return false;
}

/** Глобальный дефолт для layout и `buildSeoMetadata` (без явного `robots`). */
export function getSiteDefaultRobots(): NonNullable<Metadata["robots"]> {
    if (!SEO_ALLOW_INDEX) {
        return SEO_ROBOTS_NOINDEX_NOFOLLOW;
    }
    return { index: true, follow: true };
}

/** Metadata для сегментов из матрицы noindex — не убирать при включении индексации витрины. */
export function matrixRouteMetadata(): Pick<Metadata, "robots"> {
    return { robots: SEO_ROBOTS_NOINDEX_NOFOLLOW };
}

/** Поиск: много дублей по query — не индексировать, но передавать вес по ссылкам (план §5). */
export function searchRouteMetadata(): Pick<Metadata, "robots"> {
    return { robots: { index: false, follow: true } };
}

type SeoInput = {
    title: string;
    description: string;
    canonicalPath: string;
    /** Абсолютный URL или путь с ведущим `/` — для og:image */
    imageUrl?: string;
    /** Подпись к превью (OG/Twitter). */
    ogImageAlt?: string;
    /** По умолчанию website; article — посты. `og:type=product` в Metadata API Next.js не поддерживается (E237). */
    ogType?: "website" | "article";
    /** Без значения: матрица noindex или `getSiteDefaultRobots()`; явно — переопределение. */
    robots?: Metadata["robots"];
    /** Листинги: `<link rel="prev|next">` через Metadata API Next.js. */
    pagination?: Metadata["pagination"];
};

export const SITE_NAME = "Perfumer";

/**
 * Публичный origin без завершающего слэша. Для layout (`metadataBase`) и canonical.
 */
export function getSiteUrl(): string {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (raw) {
        return raw.replace(/\/$/, "");
    }
    return "http://localhost:3000";
}

function toAbsoluteUrl(href: string): string {
    if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
    }
    const path = href.startsWith("/") ? href : `/${href}`;
    return `${getSiteUrl()}${path}`;
}

/** OG/Twitter: абсолютный URL картинки (товар, обложка поста, путь от сайта). */
export function resolveOgImageUrl(candidate: string | null | undefined): string | undefined {
    if (!candidate?.trim()) return undefined;
    const s = candidate.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    const normalized = s.startsWith("/") ? s : `/${s}`;
    if (normalized.startsWith("/storage/")) {
        return normalizeProductImageUrl(normalized.replace(/^\//, ""));
    }
    return toAbsoluteUrl(normalized);
}

export function mainProductImageUrlForOg(product: ProductDetailData): string | undefined {
    const imgs = product.images ?? [];
    if (!imgs.length) return undefined;
    const sorted = [...imgs].sort((a, b) => {
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return resolveOgImageUrl(sorted[0]?.path ?? "");
}

/** Путь без query — для матрицы robots. */
function pathnameOnly(canonicalPath: string): string {
    const p = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
    return p.split("?")[0] ?? p;
}

/** Каталог: есть фильтры/не дефолтная сортировка (не только пагинация). */
export function catalogListingFilterActive(sp: Record<string, string | undefined>): boolean {
    const sort = sp.sort ?? "price_asc";
    if (sort !== "price_asc") return true;
    if (sp.brand?.trim()) return true;
    if (sp.price_min?.trim() || sp.price_max?.trim()) return true;
    if (sp.volume?.trim()) return true;
    if (sp.sale?.trim()) return true;
    if (sp.new?.trim()) return true;
    if (sp.hit?.trim()) return true;
    if (sp.gender?.trim()) return true;
    if (Object.keys(sp).some((k) => k.startsWith("attr_") && String(sp[k] ?? "").trim())) return true;
    return false;
}

/** Страница бренда в каталоге: фильтры по цене/объёму/атрибутам/сортировке. */
export function brandListingFilterActive(sp: Record<string, string | undefined>): boolean {
    const sort = sp.sort ?? "price_asc";
    if (sort !== "price_asc") return true;
    if (sp.price_min?.trim() || sp.price_max?.trim()) return true;
    if (sp.volume?.trim()) return true;
    if (Object.keys(sp).some((k) => k.startsWith("attr_") && String(sp[k] ?? "").trim())) return true;
    return false;
}

export function catalogCanonicalPath(sp: Record<string, string | undefined>): string {
    if (catalogListingFilterActive(sp)) {
        return "/catalog";
    }
    const page = Math.max(1, Number(sp.page || "1") || 1);
    return page > 1 ? `/catalog?page=${page}` : "/catalog";
}

export function brandCanonicalPath(brandSlug: string, sp: Record<string, string | undefined>): string {
    if (brandListingFilterActive(sp)) {
        return `/brands/${brandSlug}`;
    }
    const page = Math.max(1, Number(sp.page || "1") || 1);
    const base = `/brands/${brandSlug}`;
    return page > 1 ? `${base}?page=${page}` : base;
}

/** Отфильтрованные листинги — не индексировать, но следовать по ссылкам. */
export function listingFilterRobots(filtered: boolean): Metadata["robots"] | undefined {
    if (!filtered) return undefined;
    return { index: false, follow: true };
}

/** Абсолютные URL для rel prev/next (каталог, страница бренда). */
export function resolveListingPaginationLinks(args: {
    basePath: string;
    query: URLSearchParams;
    currentPage: number;
    lastPage: number;
}): Metadata["pagination"] | undefined {
    const { basePath, query, currentPage, lastPage } = args;
    if (lastPage <= 1) {
        return undefined;
    }
    const site = getSiteUrl();
    const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
    const pagination: NonNullable<Metadata["pagination"]> = {};
    if (currentPage > 1) {
        pagination.previous = `${site}${path}?${listingQueryWithPage(query, currentPage - 1).toString()}`;
    }
    if (currentPage < lastPage) {
        pagination.next = `${site}${path}?${listingQueryWithPage(query, currentPage + 1).toString()}`;
    }
    if (!pagination.previous && !pagination.next) {
        return undefined;
    }
    return pagination;
}

export function buildSeoMetadata({
    title,
    description,
    canonicalPath,
    imageUrl,
    ogImageAlt,
    ogType = "website",
    robots: robotsOverride,
    pagination,
}: SeoInput): Metadata {
    const base = getSiteUrl();
    const path = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
    const canonical = `${base}${path}`;
    const pathForMatrix = pathnameOnly(path);

    const robots =
        robotsOverride !== undefined
            ? robotsOverride
            : isSeoNoindexMatrixPath(pathForMatrix)
              ? SEO_ROBOTS_NOINDEX_NOFOLLOW
              : getSiteDefaultRobots();

    const resolvedImage = imageUrl ? resolveOgImageUrl(imageUrl) : undefined;
    const ogImages = resolvedImage
        ? [
            {
                url: resolvedImage,
                ...(ogImageAlt ? { alt: ogImageAlt } : {}),
            },
        ]
        : undefined;

    return {
        title,
        description,
        robots,
        alternates: {
            canonical,
        },
        ...(pagination ? { pagination } : {}),
        openGraph: {
            title,
            description,
            url: canonical,
            siteName: SITE_NAME,
            locale: "ru_RU",
            type: ogType === "article" ? "article" : "website",
            ...(ogImages && { images: ogImages }),
        },
        ...(resolvedImage && {
            twitter: {
                card: "summary_large_image",
                title,
                description,
                images: ogImageAlt
                    ? [
                          {
                              url: resolvedImage,
                              alt: ogImageAlt,
                          },
                      ]
                    : [resolvedImage],
            },
        }),
    };
}
