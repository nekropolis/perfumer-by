import type { MetadataRoute } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";

/**
 * ISR для `/sitemap.xml`.
 *
 * Один файл (без `generateSitemaps` / `/sitemap/[id].xml`) — лимит Google 50 000 URL.
 */
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
