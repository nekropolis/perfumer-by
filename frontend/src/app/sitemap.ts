import type { MetadataRoute } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";

/**
 * ISR для `/sitemap.xml`.
 *
 * Без `generateSitemaps`: чанки живут на `/sitemap/[id].xml` и конфликтуют
 * с HTML-страницей `(site)/sitemap/page.tsx` → `/sitemap`, из‑за чего
 * `/sitemap.xml` проваливался в `[slug]` и отдавал 404 витрины.
 *
 * Один файл безопасен, пока URL < 50 000 (лимит Google).
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
