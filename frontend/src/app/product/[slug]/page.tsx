import { cache } from "react";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { fetchProductReviews } from "@/lib/reviews-api";
import type { ProductDetailData, ProductDetailResponse } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import ProductDetailView from "@/components/product/product-detail-view";
import ProductReviewsSeoHtml from "@/components/product/product-reviews-seo-html";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd, productJsonLd } from "@/lib/json-ld";
import {
    buildProductMetaDescription,
    buildProductMetaTitle,
    primaryProductImageAlt,
} from "@/lib/product-page-seo";
import { getProductBreadcrumbItems } from "@/lib/product-breadcrumbs";
import { buildSeoMetadata, mainProductImageUrlForOg } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Один запрос на slug за HTTP-запрос страницы: одинаковые данные для metadata и тела (SSR + SEO). */
const getProductDetailBySlug = cache(async (slug: string): Promise<ProductDetailData> => {
    const response = await apiFetch<ProductDetailResponse>(`/catalog/products/${slug}`);
    return response.data;
});

type Props = {
    params: Promise<{
        slug: string;
    }>;
};

export async function generateMetadata({
                                           params,
                                       }: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const resolvedParams = await params;

    let product: ProductDetailData;
    try {
        product = await getProductDetailBySlug(resolvedParams.slug);
    } catch {
        return {
            title: "Товар не найден",
            robots: { index: false, follow: false },
        };
    }

    const title = buildProductMetaTitle(product);
    const description = buildProductMetaDescription(product);
    const imageUrl = mainProductImageUrlForOg(product);
    const ogImageAlt = primaryProductImageAlt(product);

    /** Open Graph: Next.js допускает только website | article для `metadata.openGraph.type` (иначе Invalid OpenGraph type). Товар — через JSON-LD Product и og:title / og:image ниже. */
    return buildSeoMetadata({
        title,
        description,
        canonicalPath: `/product/${product.slug}`,
        ...(imageUrl ? { imageUrl, ogImageAlt } : {}),
    });
}

export default async function ProductPage({ params }: Props) {
    const { slug } = await params;

    let product: ProductDetailData;
    try {
        product = await getProductDetailBySlug(slug);
    } catch {
        notFound();
    }

    const crumbs = getProductBreadcrumbItems(product);

    let initialProductReviews: ReviewItem[] = [];
    try {
        const reviewsResponse = await fetchProductReviews(product.id);
        initialProductReviews = reviewsResponse.data;
    } catch {
        // Страница товара не должна падать, если список отзывов недоступен.
    }

    return (
        <>
            <JsonLd data={[productJsonLd(product, initialProductReviews), breadcrumbListJsonLd(crumbs)]} />
            <ProductReviewsSeoHtml reviews={initialProductReviews} />
            <ProductDetailView product={product} initialProductReviews={initialProductReviews} />
        </>
    );
}