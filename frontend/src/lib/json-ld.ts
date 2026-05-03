import type { CmsPublicPage, CmsPublicPostDetail } from "@/lib/cms-pages-api";
import { formatReviewDateRu, normalizeReviewTextForDisplay } from "@/lib/review-text-display";
import { normalizeProductImageUrl } from "@/lib/product-image-url";
import type { ProductDetailData, ProductImageData, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
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

function productReviewsJsonLdPayload(reviews: ReviewItem[]): {
    review: Record<string, unknown>[];
    aggregateRating: Record<string, unknown>;
} | null {
    if (!reviews.length) {
        return null;
    }
    const review = reviews.map((r) => {
        const body = normalizeReviewTextForDisplay(r.text).slice(0, 5000);
        const published = toIsoDate(r.created_at ?? r.published_at ?? undefined);
        const row: Record<string, unknown> = {
            "@type": "Review",
            author: { "@type": "Person", name: r.name },
            reviewBody: body,
            reviewRating: {
                "@type": "Rating",
                ratingValue: r.stars,
                bestRating: 5,
                worstRating: 1,
            },
        };
        if (published) {
            row.datePublished = published;
        }
        return row;
    });
    const sum = reviews.reduce((acc, r) => acc + r.stars, 0);
    const avg = sum / reviews.length;
    const aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Math.round(avg * 10) / 10,
        reviewCount: reviews.length,
        bestRating: 5,
        worstRating: 1,
    };
    return { review, aggregateRating };
}

export function productJsonLd(product: ProductDetailData, reviews?: ReviewItem[]): Record<string, unknown> {
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

    const reviewsLd = reviews?.length ? productReviewsJsonLdPayload(reviews) : null;
    if (reviewsLd) {
        payload.review = reviewsLd.review;
        payload.aggregateRating = reviewsLd.aggregateRating;
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

/** Отзывы магазина на главной (API → UI + JSON-LD). */
export type HomePageReviewSnippet = {
    id: number;
    name: string;
    rating: number;
    /** Дата для отображения. */
    date: string;
    /** ISO для schema.org `datePublished`, если есть. */
    datePublishedIso?: string;
    text: string;
};

/** Сколько отзывов магазина грузим на главную (4 в сетке + 4 в прокрутке, JSON-LD). */
export const HOME_STORE_REVIEWS_ON_HOME_LIMIT = 8;

/** Публичные отзывы магазина из API → сниппеты главной. */
export function storeReviewItemsToHomeSnippets(items: ReviewItem[]): HomePageReviewSnippet[] {
    return items.slice(0, HOME_STORE_REVIEWS_ON_HOME_LIMIT).map((r) => {
        const iso = toIsoDate(r.published_at ?? r.created_at ?? undefined);
        const displayDate = formatReviewDateRu(r.published_at ?? r.created_at ?? null);
        return {
            id: r.id,
            name: r.name,
            rating: r.stars,
            date: displayDate || (iso ? iso.slice(0, 10) : ""),
            datePublishedIso: iso,
            text: normalizeReviewTextForDisplay(r.text),
        };
    });
}

/** Статический FAQ на главной (UI + JSON-LD). */
export type HomePageFaqItem = {
    question: string;
    answer: string;
};

export const HOME_PAGE_FAQ_ITEMS: HomePageFaqItem[] = [
    {
        question: "У вас оригинальная парфюмерия?",
        answer: "Да, мы работаем с проверенными поставщиками и предлагаем только оригинальную парфюмерию.",
    },
    {
        question: "Можно ли заказать тестер или миниатюру?",
        answer: "Да, в каталоге доступны тестеры и миниатюры — удобный вариант, чтобы познакомиться с ароматом перед покупкой полного объёма.",
    },
    {
        question: "Есть ли доставка по Беларуси?",
        answer: "Да, мы доставляем заказы по Минску и другим городам Беларуси.",
    },
    {
        question: "Можно ли получить консультацию перед покупкой?",
        answer: "Да, мы поможем подобрать аромат под сезон, повод, стиль и бюджет.",
    },
];

export function faqPageJsonLd(items: HomePageFaqItem[]): Record<string, unknown> {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
            },
        })),
    };
}

export function homeStoreJsonLd(
    reviews: HomePageReviewSnippet[],
    options?: { name?: string; description?: string },
): Record<string, unknown> {
    const name = options?.name ?? "Интернет-магазин оригинальной парфюмерии";
    const description =
        options?.description ??
        "Оригинальная женская, мужская и нишевая парфюмерия с доставкой по Минску и Беларуси.";

    const base: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Store",
        name,
        description,
        url: getSiteUrl(),
    };

    if (reviews.length === 0) {
        return base;
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = sum / reviews.length;
    base.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: String(Math.round(avg * 10) / 10),
        reviewCount: String(reviews.length),
        bestRating: "5",
        worstRating: "1",
    };
    base.review = reviews.map((review) => {
        const row: Record<string, unknown> = {
            "@type": "Review",
            author: {
                "@type": "Person",
                name: review.name,
            },
            reviewBody: review.text.slice(0, 5000),
            reviewRating: {
                "@type": "Rating",
                ratingValue: String(review.rating),
                bestRating: "5",
                worstRating: "1",
            },
        };
        if (review.datePublishedIso) {
            row.datePublished = review.datePublishedIso;
        }
        return row;
    });

    return base;
}
