import type { Metadata } from "next";
import HomeTemplate from "@/components/home/home-template";
import JsonLd from "@/components/seo/json-ld";
import { fetchCmsPageBySlug } from "@/lib/cms-pages-api";
import {
    faqPageJsonLd,
    homeStoreJsonLd,
    HOME_PAGE_FAQ_ITEMS,
    HOME_STORE_REVIEWS_ON_HOME_LIMIT,
    storeReviewItemsToHomeSnippets,
    type HomePageReviewSnippet,
} from "@/lib/json-ld";
import { fetchStoreReviews } from "@/lib/reviews-api";
import { buildSeoMetadata } from "@/lib/seo";
import { DEFAULT_SITE_CONTENT, fetchSiteContent } from "@/lib/site-content-api";
import { fetchHomeRecommendedProducts } from "@/lib/catalog-api";
import type { ProductListItem } from "@/types/catalog";

export async function generateMetadata(): Promise<Metadata> {
    const page = await fetchCmsPageBySlug("glavnaya");
    if (!page) {
        return buildSeoMetadata({
            title: "Perfumer — интернет-магазин парфюмерии",
            description: "Интернет-магазин парфюмерии и косметики.",
            canonicalPath: "/",
        });
    }

    return buildSeoMetadata({
        title: page.seo_title || page.h1 || page.name,
        description: page.seo_description || "",
        canonicalPath: "/",
    });
}

export default async function HomePage() {
    const page = await fetchCmsPageBySlug("glavnaya");
    const heroTitle = page?.h1 || "Оригинальная парфюмерия для тех, кто выбирает аромат как стиль";
    const heroDescription = page?.seo_description || "Интернет-магазин парфюмерии с доставкой по Минску и всей Беларуси.";
    const contentHtml = page?.content || "";

    let storeReviews: HomePageReviewSnippet[] = [];
    try {
        const reviewsRes = await fetchStoreReviews(HOME_STORE_REVIEWS_ON_HOME_LIMIT, 0);
        storeReviews = storeReviewItemsToHomeSnippets(reviewsRes.data);
    } catch {
        /* API недоступен или нет отзывов — главная без блока отзывов в JSON-LD */
    }

    let popularBrands = DEFAULT_SITE_CONTENT.home_popular_brands;
    try {
        const site = await fetchSiteContent();
        popularBrands = site.data.home_popular_brands ?? [];
    } catch {
        /* API недоступен — блок брендов скрыт */
    }

    let recommendedProducts: ProductListItem[] = [];
    try {
        const recommended = await fetchHomeRecommendedProducts();
        recommendedProducts = recommended.data ?? [];
    } catch {
        /* API недоступен — блок рекомендуемых скрыт */
    }

    return (
        <>
            <JsonLd data={[homeStoreJsonLd(storeReviews), faqPageJsonLd(HOME_PAGE_FAQ_ITEMS)]} />
            <HomeTemplate
                heroTitle={heroTitle}
                heroDescription={heroDescription}
                contentHtml={contentHtml}
                storeReviews={storeReviews}
                popularBrands={popularBrands}
                recommendedProducts={recommendedProducts}
            />
        </>
    );
}
