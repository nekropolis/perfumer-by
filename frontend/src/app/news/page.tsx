import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import NewsList from "@/components/content/news-list";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Новости",
    description: "Новости магазина и индустрии парфюмерии.",
    canonicalPath: "/news",
});

export default function NewsPage() {
    const crumbs = [{ label: "Главная", href: "/" }, { label: "Новости" }];

    return (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <JsonLd data={breadcrumbListJsonLd(crumbs)} />
            <Breadcrumbs className="mb-6" items={crumbs} />
            <NewsList limit={12} />
        </main>
    );
}
