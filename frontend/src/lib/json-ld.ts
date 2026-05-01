import type { CmsPublicPage, CmsPublicPostDetail } from "@/lib/cms-pages-api";
import { normalizeProductImageUrl } from "@/lib/product-image-url";
import type { ProductDetailData, ProductImageData, ProductVariantData } from "@/types/catalog";
import type { SiteContent } from "@/lib/site-content-api";
import { formatBynAmountDisplay } from "@/lib/format-byn";
import { stripHtml } from "@/lib/seo-text";
import { getSiteUrl } from "@/lib/seo";

const SITE_LABEL = "Perfumer";

export type BreadcrumbJsonLdItem = {
    label: string;
    href?: string;
};

function toIsoDate(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

/** Абсолютный URL для сайта или внешней картинки (CMS cover и т.п.). */
export function toAbsolutePublicUrl(href: string): string {
    if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
    }
    const base = getSiteUrl();
    const path = href.startsWith("/") ? href : `/${href}`;
    return `${base}${path}`;
}

function schemaAvailabilityFallback(product: ProductDetailData): string {
    const variants = product.variants ?? [];
    if (product.stock_total > 0) {
        return "https://schema.org/InStock";
    }
    if (variants.some((v) => v.is_preorder && v.is_available)) {
        return "https://schema.org/PreOrder";
    }
    if (variants.some((v) => v.is_available)) {
        return product.is_out_of_stock ? "https://schema.org/BackOrder" : "https://schema.org/InStock";
    }
    return "https://schema.org/OutOfStock";
}

/** Согласовано с витриной: предзаказ; иначе склад поставщика → BackOrder вместо InStock. */
function variantOfferAvailability(product: ProductDetailData, variant: ProductVariantData): string {
    if (variant.is_preorder && variant.is_available) {
        return "https://schema.org/PreOrder";
    }
    if (!variant.is_available) {
        return "https://schema.org/OutOfStock";
    }
    if (product.is_out_of_stock) {
        return "https://schema.org/BackOrder";
    }
    return "https://schema.org/InStock";
}

function productImagesForJsonLd(images: ProductImageData[]): string[] {
    if (!images.length) return [];
    const sorted = [...images].sort((a, b) => {
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return sorted
        .map((img) => normalizeProductImageUrl(img.path))
        .filter(Boolean);
}

export function breadcrumbListJsonLd(items: BreadcrumbJsonLdItem[]): Record<string, unknown> {
    const site = getSiteUrl();
    const listItems = items.map((item, index) => {
        const position = index + 1;
        const pathOrFull = item.href?.startsWith("http") ? item.href : item.href ? `${site}${item.href.startsWith("/") ? item.href : `/${item.href}`}` : undefined;
        const entry: Record<string, unknown> = {
            "@type": "ListItem",
            position,
            name: item.label,
        };
        if (pathOrFull) {
            entry.item = pathOrFull;
        }
        return entry;
    });

    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: listItems,
    };
}

export function organizationJsonLd(): Record<string, unknown> {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_LABEL,
        url: getSiteUrl(),
    };
}

/**
 * Контакты из публичного `/site/content` (телефоны из админки).
 * Физический адрес пока не в API — без PostalAddress.
 */
export function localBusinessJsonLd(content: SiteContent): Record<string, unknown> {
    const base = getSiteUrl();
    const phonesRaw = [content.contact_phone_mts, content.contact_phone_a1, content.contact_phone_life];
    const phones = phonesRaw.map((p) => String(p ?? "").trim()).filter(Boolean);

    const sameAs: string[] = [];
    const tg = content.contact_telegram_url?.trim();
    if (tg?.startsWith("http")) {
        sameAs.push(tg);
    }

    const contactPoint = phones.map((telephone) => ({
        "@type": "ContactPoint",
        telephone,
        contactType: "customer service",
        areaServed: "BY",
    }));

    const payload: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: SITE_LABEL,
        url: base,
        ...(phones[0] ? { telephone: phones[0] } : {}),
        ...(contactPoint.length
            ? { contactPoint: contactPoint.length === 1 ? contactPoint[0] : contactPoint }
            : {}),
        ...(sameAs.length ? { sameAs } : {}),
    };

    return payload;
}

export function webSiteJsonLd(): Record<string, unknown> {
    const base = getSiteUrl();
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_LABEL,
        url: base,
        publisher: {
            "@type": "Organization",
            name: SITE_LABEL,
            url: base,
        },
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${base}/search?query={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };
}

export function productJsonLd(product: ProductDetailData): Record<string, unknown> {
    const site = getSiteUrl();
    const productUrl = `${site}/product/${product.slug}`;
    const descFromHtml = stripHtml(product.description || "");
    const descRaw =
        descFromHtml ||
        product.short_description?.trim() ||
        `Купить ${product.name}`;
    const description = descRaw.slice(0, 5000);

    const images = productImagesForJsonLd(product.images || []);
    const brand = product.brand
        ? {
              "@type": "Brand",
              name: product.brand.name,
          }
        : undefined;

    const variants = product.variants ?? [];

    let offers: Record<string, unknown> | Record<string, unknown>[];

    if (variants.length > 0) {
        const list = variants.map((variant) => {
            const offer: Record<string, unknown> = {
                "@type": "Offer",
                url: productUrl,
                priceCurrency: "BYN",
                availability: variantOfferAvailability(product, variant),
                itemCondition: "https://schema.org/NewCondition",
                sku: `${product.id}-${variant.id}`,
                name: `${product.name} ${variant.display_name}`.replace(/\s+/g, " ").trim(),
            };
            if (variant.price != null && String(variant.price).trim() !== "") {
                offer.price = formatBynAmountDisplay(variant.price);
            }
            return offer;
        });
        offers = list.length === 1 ? list[0]! : list;
    } else {
        const minP = product.price_range.min;
        const maxP = product.price_range.max;
        const availability = schemaAvailabilityFallback(product);

        if (minP && maxP && minP !== maxP) {
            offers = {
                "@type": "AggregateOffer",
                priceCurrency: "BYN",
                lowPrice: formatBynAmountDisplay(minP),
                highPrice: formatBynAmountDisplay(maxP),
                offerCount: 1,
                availability,
            };
        } else if (minP) {
            offers = {
                "@type": "Offer",
                url: productUrl,
                priceCurrency: "BYN",
                price: formatBynAmountDisplay(minP),
                availability,
            };
        } else {
            offers = {
                "@type": "Offer",
                url: productUrl,
                priceCurrency: "BYN",
                availability,
            };
        }
    }

    const payload: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description,
        url: productUrl,
        sku: String(product.id),
        offers,
    };

    if (images.length) {
        payload.image = images;
    }
    if (brand) {
        payload.brand = brand;
    }

    return payload;
}

export function webPageJsonLd(args: {
    path: string;
    name: string;
    description?: string | null;
}): Record<string, unknown> {
    const site = getSiteUrl();
    const path = args.path.startsWith("/") ? args.path : `/${args.path}`;
    const url = `${site}${path}`;
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: args.name,
        description: args.description?.trim() || undefined,
        url,
    };
}

function postArticleBase(post: CmsPublicPostDetail, url: string, type: "Article" | "NewsArticle"): Record<string, unknown> {
    const image = post.cover_image ? toAbsolutePublicUrl(post.cover_image) : undefined;
    const published = toIsoDate(post.created_at);
    const modified = toIsoDate(post.updated_at);
    const desc = [post.excerpt, post.seo_description].find((s) => s && String(s).trim()) ?? "";

    const base: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": type,
        headline: post.title,
        description: desc.trim() || undefined,
        datePublished: published,
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": url,
        },
        url,
    };

    if (modified) {
        base.dateModified = modified;
    }
    if (image) {
        base.image = [image];
    }

    return base;
}

export function articleJsonLd(post: CmsPublicPostDetail, slugPath: string): Record<string, unknown> {
    const path = slugPath.startsWith("/") ? slugPath : `/${slugPath}`;
    const url = `${getSiteUrl()}${path}`;
    return postArticleBase(post, url, "Article");
}

export function newsArticleJsonLd(post: CmsPublicPostDetail, slugPath: string): Record<string, unknown> {
    const path = slugPath.startsWith("/") ? slugPath : `/${slugPath}`;
    const url = `${getSiteUrl()}${path}`;
    return postArticleBase(post, url, "NewsArticle");
}

export function cmsPageWebPageJsonLd(page: CmsPublicPage): Record<string, unknown> {
    return webPageJsonLd({
        path: `/${page.slug}`,
        name: page.h1 || page.name,
        description: page.seo_description,
    });
}
