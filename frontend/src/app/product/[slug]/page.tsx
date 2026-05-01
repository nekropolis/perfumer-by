import { cache } from "react";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { ProductDetailData, ProductDetailResponse } from "@/types/catalog";
import ProductDetailView from "@/components/product/product-detail-view";
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

    return (
        <>
            <JsonLd data={[productJsonLd(product), breadcrumbListJsonLd(crumbs)]} />
            <ProductDetailView product={product} />
        </>
    );
}