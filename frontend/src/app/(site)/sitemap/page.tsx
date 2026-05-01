import Link from "next/link";
import type { Metadata } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";
import { buildSeoMetadata } from "@/lib/seo";

/** Route segment config must be a numeric literal (Next.js). Default matches `sitemap-config` / `unstable_cache`. */
export const revalidate = 3600;

export const metadata: Metadata = buildSeoMetadata({
    title: "Карта сайта",
    description: "Основные разделы и страницы интернет-магазина Perfumer.",
    canonicalPath: "/sitemap",
});

function sectionTitle(label: string) {
    return (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{label}</h2>
    );
}

const MAIN_PATHS = new Set([
    "/",
    "/catalog",
    "/brands",
    "/articles",
    "/news",
    "/reviews",
    "/gift-certificates",
]);

function labelForMainPath(path: string): string {
    if (path === "/") return "Главная";
    const map: Record<string, string> = {
        "/catalog": "Каталог",
        "/brands": "Бренды",
        "/articles": "Статьи",
        "/news": "Новости",
        "/reviews": "Отзывы о магазине",
        "/gift-certificates": "Подарочные сертификаты",
    };
    return map[path] ?? path;
}

export default async function SitemapHtmlPage() {
    const entries = await getCachedSitemapEntries();

    const main = entries.filter((e) => MAIN_PATHS.has(e.path));
    const products = entries.filter((e) => e.path.startsWith("/product/"));
    const brandPages = entries.filter((e) => e.path.startsWith("/brands/") && e.path !== "/brands");
    const other = entries.filter(
        (e) =>
            !MAIN_PATHS.has(e.path) &&
            !e.path.startsWith("/product/") &&
            !(e.path.startsWith("/brands/") && e.path !== "/brands"),
    );

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h1 className="text-3xl font-semibold text-[var(--foreground)]">Карта сайта</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                Полный перечень индексируемых URL (без служебных и noindex-страниц). Для краулеров —
                файл{" "}
                <a
                    href="/sitemap.xml"
                    className="font-medium text-[var(--accent)] underline underline-offset-2 hover:no-underline"
                >
                    sitemap.xml
                </a>
                .
            </p>

            <div className="mt-10 space-y-10">
                {main.length > 0 ? (
                    <section>
                        {sectionTitle("Разделы")}
                        <ul className="columns-1 gap-x-8 text-sm sm:columns-2">
                            {main.map((e) => (
                                <li key={e.path} className="mb-2 break-inside-avoid">
                                    <Link href={e.path} className="text-[var(--foreground)] hover:text-[var(--accent)] hover:underline">
                                        {labelForMainPath(e.path)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {brandPages.length > 0 ? (
                    <section>
                        {sectionTitle("Бренды")}
                        <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3">
                            {brandPages.map((e) => (
                                <li key={e.path} className="mb-2 break-inside-avoid">
                                    <Link href={e.path} className="hover:text-[var(--accent)] hover:underline">
                                        {e.path.replace("/brands/", "")}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {products.length > 0 ? (
                    <section>
                        {sectionTitle("Товары")}
                        <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3">
                            {products.map((e) => (
                                <li key={e.path} className="mb-2 break-inside-avoid">
                                    <Link href={e.path} className="hover:text-[var(--accent)] hover:underline">
                                        {e.path.replace("/product/", "")}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {other.length > 0 ? (
                    <section>
                        {sectionTitle("Страницы")}
                        <ul className="columns-1 gap-x-8 text-sm sm:columns-2">
                            {other.map((e) => (
                                <li key={e.path} className="mb-2 break-inside-avoid">
                                    <Link href={e.path} className="hover:text-[var(--accent)] hover:underline">
                                        {e.path}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
