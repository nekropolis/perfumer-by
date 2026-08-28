import type { BuiltSitemapEntry } from "@/lib/sitemap-builder";
import { buildSitemapEntries } from "@/lib/sitemap-builder";

/**
 * Payload sitemap может превышать лимит Data Cache Next.js (~2MB),
 * поэтому `unstable_cache` здесь не используем.
 *
 * Источник правды для списка URL — Laravel Redis (`SeoSitemapService`, TTL 1ч + `seo:warm-sitemap`).
 * На фронте остаётся route-level ISR (`revalidate = 3600`) в `app/sitemap.ts`.
 */
export function getCachedSitemapEntries(): Promise<BuiltSitemapEntry[]> {
    return buildSitemapEntries();
}
