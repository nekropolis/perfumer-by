import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ArticlesList from "@/components/content/articles-list";

export const metadata: Metadata = {
    title: "Статьи",
    description: "Статьи и полезные материалы о парфюмерии.",
};

export default function ArticlesPage() {
    return (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-6"
                items={[{ label: "Главная", href: "/" }, { label: "Статьи" }]}
            />
            <ArticlesList limit={12} />
        </main>
    );
}
