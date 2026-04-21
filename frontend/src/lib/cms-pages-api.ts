export type CmsPublicPage = {
    id: number;
    name: string;
    slug: string;
    h1?: string | null;
    content?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
};

function getApiBase(): string {
    const isBrowser = typeof window !== "undefined";
    const internal = process.env.API_URL?.trim() || process.env.INTERNAL_API_URL?.trim();
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();

    if (isBrowser) {
        if (!pub) {
            throw new Error("NEXT_PUBLIC_API_URL is not defined");
        }
        return pub.replace(/\/$/, "");
    }

    const base = internal || pub;
    if (!base) {
        throw new Error("Set API_URL or NEXT_PUBLIC_API_URL for CMS pages fetching");
    }
    return base.replace(/\/$/, "");
}

export async function fetchCmsPageBySlug(slug: string): Promise<CmsPublicPage | null> {
    const base = getApiBase();
    const res = await fetch(`${base}/pages/${encodeURIComponent(slug)}`, {
        cache: "no-store",
    });

    if (res.status === 404) {
        return null;
    }

    if (!res.ok) {
        throw new Error(`CMS API error: ${res.status}`);
    }

    const data = (await res.json()) as { data?: CmsPublicPage };
    return data.data ?? null;
}
