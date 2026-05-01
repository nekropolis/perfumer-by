/** ISR + unstable_cache: интервал в секундах (по умолчанию 1 час). */
export const SITEMAP_REVALIDATE_SECONDS =
    Number(process.env.NEXT_PUBLIC_SITEMAP_REVALIDATE_SECONDS) > 0
        ? Number(process.env.NEXT_PUBLIC_SITEMAP_REVALIDATE_SECONDS)
        : 3600;
