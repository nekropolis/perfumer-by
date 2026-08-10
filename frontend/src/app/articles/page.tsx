import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ArticlesList from "@/components/content/articles-list";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Статьи о парфюмерии — гиды и материалы | Perfumer",
    description:
        "Статьи и полезные материалы о парфюмерии: как выбирать ароматы, ноты, бренды и уход. Советы магазина Perfumer.",
    canonicalPath: "/articles",
});

export default function ArticlesPage() {
    const crumbs = [{ label: "Главная", href: "/" }, { label: "Статьи" }];

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd data={breadcrumbListJsonLd(crumbs)} />
                <Breadcrumbs className="mb-6" items={crumbs} />
                <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">Статьи</h1>
                <ArticlesList limit={12} />
            </div>
        </main>
    );
}
