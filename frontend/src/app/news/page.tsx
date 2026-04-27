import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import NewsList from "@/components/content/news-list";

export const metadata: Metadata = {
    title: "Новости",
    description: "Новости магазина и индустрии парфюмерии.",
};

export default function NewsPage() {
    return (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-6"
                items={[{ label: "Главная", href: "/" }, { label: "Новости" }]}
            />
            <NewsList limit={12} />
        </main>
    );
}
