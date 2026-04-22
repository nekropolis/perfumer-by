import type { Metadata } from "next";
import HomeTemplate from "@/components/home/home-template";
import { fetchCmsPageBySlug } from "@/lib/cms-pages-api";

export async function generateMetadata(): Promise<Metadata> {
    const page = await fetchCmsPageBySlug("glavnaya");
    if (!page) {
        return {
            title: "Perfumer — интернет-магазин парфюмерии",
            description: "Интернет-магазин парфюмерии и косметики.",
        };
    }

    return {
        title: page.seo_title || page.h1 || page.name,
        description: page.seo_description || "",
    };
}

export default async function HomePage() {
    const page = await fetchCmsPageBySlug("glavnaya");
    const heroTitle = page?.h1 || "Оригинальная парфюмерия для тех, кто выбирает аромат как стиль";
    const heroDescription = page?.seo_description || "Интернет-магазин парфюмерии с доставкой по Минску и всей Беларуси.";
    const contentHtml = page?.content || "";

    return <HomeTemplate heroTitle={heroTitle} heroDescription={heroDescription} contentHtml={contentHtml} />;
}
