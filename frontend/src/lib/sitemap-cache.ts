import type { BuiltSitemapEntry } from "@/lib/sitemap-builder";
import { buildSitemapEntries } from "@/lib/sitemap-builder";

/**
 * Для больших sitemap (тысячи URL) payload может превышать лимит Data Cache Next.js (~2MB),
 * из-за чего `unstable_cache` шумит предупреждениями на build/deploy.
 *
 * Здесь сознательно без `unstable_cache`: используем route-level ISR (`revalidate`)
 * в `app/sitemap.ts` и `app/(site)/sitemap/page.tsx`.
 */
export function getCachedSitemapEntries(): Promise<BuiltSitemapEntry[]> {
    return buildSitemapEntries();
}
