import { cache } from "react";
import { notFound } from "next/navigation";
import { isApiNotFoundError } from "@/lib/api";
import { fetchCatalogProductDetail } from "@/lib/catalog-api";
import type { ProductDetailData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import ProductDetailPage from "@/components/product/product-detail-page";
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

type ProductPagePayload = {
    product: ProductDetailData;
    reviews: ReviewItem[];
};

/** Один запрос на slug за HTTP-запрос страницы: одинаковые данные для metadata и тела (SSR + SEO). */
const getProductPagePayload = cache(async (slug: string): Promise<ProductPagePayload> => {
    const response = await fetchCatalogProductDetail(slug);
    return {
        product: response.data,
        reviews: response.reviews?.data ?? [],
    };
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
        ({ product } = await getProductPagePayload(resolvedParams.slug));
    } catch (e) {
        if (isApiNotFoundError(e)) {
            notFound();
        }
        throw e;
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

    let payload: ProductPagePayload;
    try {
        payload = await getProductPagePayload(slug);
    } catch (e) {
        if (isApiNotFoundError(e)) {
            notFound();
        }
        throw e;
    }

    const { product, reviews: initialProductReviews } = payload;
    const crumbs = getProductBreadcrumbItems(product);

    return (
        <>
            <JsonLd data={[productJsonLd(product, initialProductReviews), breadcrumbListJsonLd(crumbs)]} />
            <ProductReviewsSeoHtml reviews={initialProductReviews} />
            <ProductDetailPage product={product} initialProductReviews={initialProductReviews} />
        </>
    );
}
