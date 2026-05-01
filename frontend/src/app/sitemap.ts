import type { MetadataRoute } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";

/** ISR (файл sitemap.xml). Литерал требуется Next.js; дефолт как в `sitemap-config`, кеш — `unstable_cache`. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const rows = await getCachedSitemapEntries();

    return rows.map(({ url, lastModified, priority }) => ({
        url,
        lastModified,
        changeFrequency: "weekly" as const,
        priority,
    }));
}
