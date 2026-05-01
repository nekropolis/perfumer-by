import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import CmsPageView from "@/components/cms/cms-page-view";
import ArticlePostDetailView from "@/components/content/article-post-detail-view";
import NewsPostDetailView from "@/components/content/news-post-detail-view";
import { fetchCmsPageBySlug, fetchCmsPostBySlug } from "@/lib/cms-pages-api";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;

    const page = await fetchCmsPageBySlug(slug);
    if (page) {
        const title = page.seo_title || page.h1 || page.name;
        const description = page.seo_description || "";
        return { title, description };
    }

    const news = await fetchCmsPostBySlug(slug, "news");
    if (news && news.type === "news") {
        return {
            title: news.seo_title || news.title,
            description: news.seo_description || news.excerpt || "",
        };
    }

    const article = await fetchCmsPostBySlug(slug, "article");
    if (article && article.type === "article") {
        return {
            title: article.seo_title || article.title,
            description: article.seo_description || article.excerpt || "",
        };
    }

    return {};
}

export default async function RootSlugPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (slug === "home" || slug === "glavnaya") {
        redirect("/");
    }

    const page = await fetchCmsPageBySlug(slug);
    if (page) {
        return <CmsPageView page={page} />;
    }

    const news = await fetchCmsPostBySlug(slug, "news");
    if (news && news.type === "news") {
        return <NewsPostDetailView post={news} />;
    }

    const article = await fetchCmsPostBySlug(slug, "article");
    if (article && article.type === "article") {
        return <ArticlePostDetailView post={article} />;
    }

    notFound();
}
