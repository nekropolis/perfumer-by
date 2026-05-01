const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

/** Публичные данные для шапки/подвала и др. (см. PublicSiteContentController). */
export type SiteContent = {
    delivery_minsk_free_threshold: number;
    delivery_minsk_fee: number;
    delivery_belarus_fee: number;
    delivery_belarus_free_min_lines: number;
    contact_phone_mts: string;
    contact_phone_a1: string;
    contact_phone_life: string;
    contact_telegram_url: string;
    contact_viber_url: string;
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
    contact_telegram_url: "https://t.me/perfumer_support",
    contact_viber_url: "viber://chat?number=%2B375296408833",
};

let siteContentRequest: Promise<SiteContentResponse> | null = null;

export async function fetchSiteContent(): Promise<SiteContentResponse> {
    if (!siteContentRequest) {
        siteContentRequest = fetch(`${API_BASE}/site/content`, { cache: "no-store" })
            .then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || `Site content API error: ${res.status}`);
                }
                return res.json();
            })
            .catch((err) => {
                siteContentRequest = null;
                throw err;
            });
    }
    return siteContentRequest;
}
