import { getApiBase } from "@/lib/api";

export type HomePopularBrand = {
    id: number;
    name: string;
    slug: string;
};

/** Публичные данные для шапки/подвала и др. (см. PublicSiteContentController). */
export type SiteContent = {
    delivery_minsk_free_threshold: number;
    delivery_minsk_fee: number;
    delivery_belarus_fee: number;
    delivery_belarus_free_min_lines: number;
    contact_phone_mts: string;
    contact_phone_a1: string;
    contact_phone_life: string;
    contact_email: string;
    legal_name: string;
    legal_unp: string;
    legal_address: string;
    contact_telegram_url: string;
    contact_viber_url: string;
    waiting_discount_delivery_date: string;
    home_popular_brands: HomePopularBrand[];
    search_popular_brands: HomePopularBrand[];
    filter_popular_brands: HomePopularBrand[];
};

export type SiteContentResponse = {
    data: SiteContent;
};

/** Совпадает с дефолтами бэкенда `ShopSettingService` / админки — если API недоступен. */
export const DEFAULT_SITE_CONTENT: SiteContent = {
    delivery_minsk_free_threshold: 50,
    delivery_minsk_fee: 3,
    delivery_belarus_fee: 6,
    delivery_belarus_free_min_lines: 2,
    contact_phone_mts: "+375336408833",
    contact_phone_a1: "+375296408833",
    contact_phone_life: "+375256408833",
    contact_email: "admin@perfumer.by",
    legal_name: "ИП Гришкевич П.А.",
    legal_unp: "191168408",
    legal_address: "",
    contact_telegram_url: "https://t.me/perfumer_support",
    contact_viber_url: "viber://chat?number=%2B375296408833",
    waiting_discount_delivery_date: "10.07.2026",
    home_popular_brands: [],
    search_popular_brands: [],
    filter_popular_brands: [],
};

type FetchSiteContentOptions = {
    /** Отключить Next.js fetch-кэш (например, для страниц, где дата должна быть свежей). */
    noCache?: boolean;
};

export async function fetchSiteContent(options?: FetchSiteContentOptions): Promise<SiteContentResponse> {
    const base = getApiBase();
    const isServer = typeof window === "undefined";

    const fetchInit: RequestInit = isServer
        ? options?.noCache
            ? { cache: "no-store" }
            : { next: { revalidate: 3600, tags: ["site-content"] } }
        : { cache: "no-store" };

    const res = await fetch(`${base}/site/content`, fetchInit);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Site content API error: ${res.status}`);
    }

    const json = (await res.json()) as SiteContentResponse;

    return {
        data: {
            ...DEFAULT_SITE_CONTENT,
            ...json.data,
            home_popular_brands: Array.isArray(json.data?.home_popular_brands)
                ? json.data.home_popular_brands
                : [],
            search_popular_brands: Array.isArray(json.data?.search_popular_brands)
                ? json.data.search_popular_brands
                : [],
            filter_popular_brands: Array.isArray(json.data?.filter_popular_brands)
                ? json.data.filter_popular_brands
                : [],
        },
    };
}
