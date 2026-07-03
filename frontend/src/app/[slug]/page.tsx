import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import CmsPageView from "@/components/cms/cms-page-view";
import ArticlePostDetailView from "@/components/content/article-post-detail-view";
import NewsPostDetailView from "@/components/content/news-post-detail-view";
import JsonLd from "@/components/seo/json-ld";
import {
    articleJsonLd,
    breadcrumbListJsonLd,
    cmsPageWebPageJsonLd,
    newsArticleJsonLd,
    productJsonLd,
} from "@/lib/json-ld";
import { fetchCmsPageBySlug, fetchCmsPostBySlug } from "@/lib/cms-pages-api";
import { buildSeoMetadata, mainProductImageUrlForOg } from "@/lib/seo";
import { isApiNotFoundError } from "@/lib/api";
import { fetchCatalogProductDetail } from "@/lib/catalog-api";
import type { ProductDetailData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import ProductDetailPage from "@/components/product/product-detail-page";
import ProductReviewsSeoHtml from "@/components/product/product-reviews-seo-html";
import {
    buildProductMetaDescription,
    buildProductMetaTitle,
    primaryProductImageAlt,
} from "@/lib/product-page-seo";
import { getProductBreadcrumbItems } from "@/lib/product-breadcrumbs";

type ProductPagePayload = {
    product: ProductDetailData;
    reviews: ReviewItem[];
};

const getProductPagePayload = cache(async (slug: string): Promise<ProductPagePayload> => {
    const response = await fetchCatalogProductDetail(slug);
    return {
        product: response.data,
        reviews: response.reviews?.data ?? [],
    };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;

    const page = await fetchCmsPageBySlug(slug);
    if (page) {
        return buildSeoMetadata({
            title: page.seo_title || page.h1 || page.name,
            description: page.seo_description || "",
            canonicalPath: `/${slug}`,
        });
    }

    const news = await fetchCmsPostBySlug(slug, "news");
    if (news && news.type === "news") {
        return buildSeoMetadata({
            title: news.seo_title || news.title,
            description: news.seo_description || news.excerpt || "",
            canonicalPath: `/${slug}`,
            ogType: "article",
            imageUrl: news.cover_image ?? undefined,
        });
    }

    const article = await fetchCmsPostBySlug(slug, "article");
    if (article && article.type === "article") {
        return buildSeoMetadata({
            title: article.seo_title || article.title,
            description: article.seo_description || article.excerpt || "",
            canonicalPath: `/${slug}`,
            ogType: "article",
            imageUrl: article.cover_image ?? undefined,
        });
    }

    try {
        const { product } = await getProductPagePayload(slug);
        const title = buildProductMetaTitle(product);
        const description = buildProductMetaDescription(product);
        const imageUrl = mainProductImageUrlForOg(product);
        const ogImageAlt = primaryProductImageAlt(product);
        return buildSeoMetadata({
            title,
            description,
            canonicalPath: `/${product.slug}`,
            ...(imageUrl ? { imageUrl, ogImageAlt } : {}),
        });
    } catch (e) {
        if (!isApiNotFoundError(e)) {
            throw e;
        }
    }

    return {
        title: "Страница не найдена",
        robots: { index: false, follow: false },
    };
}

export default async function RootSlugPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (slug === "home" || slug === "glavnaya") {
        redirect("/");
    }

    const page = await fetchCmsPageBySlug(slug);
    if (page) {
        return (
            <>
                <JsonLd
                    data={[
                        cmsPageWebPageJsonLd(page),
                        breadcrumbListJsonLd([
                            { label: "Главная", href: "/" },
                            { label: page.h1 || page.name },
                        ]),
                    ]}
                />
                <CmsPageView page={page} />
            </>
        );
    }

    const news = await fetchCmsPostBySlug(slug, "news");
    if (news && news.type === "news") {
        return (
            <>
                <JsonLd
                    data={[
                        newsArticleJsonLd(news, slug),
                        breadcrumbListJsonLd([
                            { label: "Главная", href: "/" },
                            { label: "Новости", href: "/news" },
                            { label: news.title },
                        ]),
                    ]}
                />
                <NewsPostDetailView post={news} />
            </>
        );
    }

    const article = await fetchCmsPostBySlug(slug, "article");
    if (article && article.type === "article") {
        return (
            <>
                <JsonLd
                    data={[
                        articleJsonLd(article, slug),
                        breadcrumbListJsonLd([
                            { label: "Главная", href: "/" },
                            { label: "Статьи", href: "/articles" },
                            { label: article.title },
                        ]),
                    ]}
                />
                <ArticlePostDetailView post={article} />
            </>
        );
    }

    try {
        const payload = await getProductPagePayload(slug);
        const { product, reviews: initialProductReviews } = payload;
        const crumbs = getProductBreadcrumbItems(product);
        return (
            <>
                <JsonLd data={[productJsonLd(product, initialProductReviews), breadcrumbListJsonLd(crumbs)]} />
                <ProductReviewsSeoHtml reviews={initialProductReviews} />
                <ProductDetailPage product={product} initialProductReviews={initialProductReviews} />
            </>
        );
    } catch (e) {
        if (!isApiNotFoundError(e)) {
            throw e;
        }
    }

    notFound();
}
