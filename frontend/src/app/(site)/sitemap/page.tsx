import Link from "next/link";
import type { Metadata } from "next";
import { getCachedSitemapEntries } from "@/lib/sitemap-cache";
import type { BuiltSitemapEntry } from "@/lib/sitemap-builder";
import { buildSeoMetadata } from "@/lib/seo";
import { siteCard } from "@/lib/site-ui-classes";

/** Route segment config must be a numeric literal (Next.js). Default matches `sitemap-config`. */
export const revalidate = 3600;

export const metadata: Metadata = buildSeoMetadata({
    title: "Карта сайта",
    description: "Основные разделы и страницы интернет-магазина Perfumer.",
    canonicalPath: "/sitemap",
});

function sectionTitle(label: string) {
    return (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">{label}</h2>
    );
}

function linkLabel(entry: BuiltSitemapEntry): string {
    if (entry.title?.trim()) return entry.title.trim();
    if (entry.path.startsWith("/brands/")) return entry.path.replace("/brands/", "");
    if (entry.path === "/") return "Главная";
    return entry.path.replace(/^\//, "") || entry.path;
}

function LinkList({ items }: { items: BuiltSitemapEntry[] }) {
    if (items.length === 0) return null;
    return (
        <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3">
            {items.map((e) => (
                <li key={e.path} className="mb-2 break-inside-avoid">
                    <Link href={e.path} className="text-admin-text hover:text-admin-primary hover:underline">
                        {linkLabel(e)}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export default async function SitemapHtmlPage() {
    const entries = await getCachedSitemapEntries();

    const main = entries.filter((e) => e.type === "static");
    const brandPages = entries.filter((e) => e.type === "brand");
    const posts = entries.filter((e) => e.type === "post");
    const pages = entries.filter((e) => e.type === "page");

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Карта сайта</h1>

                <div className={`${siteCard} mt-8 divide-y divide-admin-border p-5 sm:p-6`}>
                    {main.length > 0 ? (
                        <section className="pb-8 last:pb-0">
                            {sectionTitle("Разделы")}
                            <LinkList items={main} />
                        </section>
                    ) : null}

                    {brandPages.length > 0 ? (
                        <section className="py-8 first:pt-0 last:pb-0">
                            {sectionTitle("Бренды")}
                            <LinkList items={brandPages} />
                        </section>
                    ) : null}

                    {posts.length > 0 ? (
                        <section className="py-8 first:pt-0 last:pb-0">
                            {sectionTitle("Статьи и новости")}
                            <LinkList items={posts} />
                        </section>
                    ) : null}

                    {pages.length > 0 ? (
                        <section className="pt-8 first:pt-0">
                            {sectionTitle("Страницы")}
                            <LinkList items={pages} />
                        </section>
                    ) : null}
                </div>
            </div>
        </main>
    );
}
