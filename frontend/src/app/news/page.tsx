import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import NewsList from "@/components/content/news-list";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Новости парфюмерии и магазина | Perfumer",
    description:
        "Новости магазина Perfumer и индустрии парфюмерии: поступления, акции и события.",
    canonicalPath: "/news",
});

export default function NewsPage() {
    const crumbs = [{ label: "Главная", href: "/" }, { label: "Новости" }];

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd data={breadcrumbListJsonLd(crumbs)} />
                <Breadcrumbs className="mb-6" items={crumbs} />
                <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">Новости</h1>
                <NewsList limit={12} />
            </div>
        </main>
    );
}
