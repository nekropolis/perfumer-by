import type { MetadataRoute } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";

/**
 * ISR для sitemap.
 * В Next.js много sitemap-файлов формируются через generateSitemaps + sitemap({ id }),
 * а `/sitemap.xml` становится sitemap-index автоматически.
 */
export const revalidate = 3600;
// Безопасно ниже лимита 50k URL на один sitemap-файл, но достаточно крупно,
// чтобы не плодить лишние sitemap-чанки.
const SITEMAP_CHUNK_SIZE = 10000;

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
    const rows = await getCachedSitemapEntries();
    const pages = Math.max(1, Math.ceil(rows.length / SITEMAP_CHUNK_SIZE));
    return Array.from({ length: pages }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
    const rows = await getCachedSitemapEntries();
    const start = id * SITEMAP_CHUNK_SIZE;
    const chunk = rows.slice(start, start + SITEMAP_CHUNK_SIZE);

    return chunk.map(({ url, lastModified, priority }) => ({
        url,
        lastModified,
        changeFrequency: "weekly" as const,
        priority,
    }));
}
