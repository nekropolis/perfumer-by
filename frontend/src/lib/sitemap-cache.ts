import { unstable_cache } from "next/cache";
import type { BuiltSitemapEntry } from "@/lib/sitemap-builder";
import { buildSitemapEntries } from "@/lib/sitemap-builder";
import { SITEMAP_REVALIDATE_SECONDS } from "@/lib/sitemap-config";

const loadSitemapEntriesCached = unstable_cache(
    async () => buildSitemapEntries(),
    ["sitemap-all-entries-v1"],
    { revalidate: SITEMAP_REVALIDATE_SECONDS },
);

/**
 * Один тяжёлый проход по API — кеш на сервере Next между запросами к /sitemap.xml и /sitemap.
 */
export function getCachedSitemapEntries(): Promise<BuiltSitemapEntry[]> {
    return loadSitemapEntriesCached();
}
