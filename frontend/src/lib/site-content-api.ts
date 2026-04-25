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
};

export type SiteContentResponse = {
    data: SiteContent;
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
