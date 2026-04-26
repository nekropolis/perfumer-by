import { cache } from "react";
import { apiFetch } from "@/lib/api";
import type { ProductDetailData, ProductDetailResponse } from "@/types/catalog";
import ProductDetailView from "@/components/product/product-detail-view";
import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo";

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
    const product = await getProductDetailBySlug(resolvedParams.slug);

    const descriptionSource =
        product.short_description ||
        product.description ||
        `Купить ${product.name} с актуальными вариантами и ценами.`;

    const description =
        descriptionSource.length > 160
            ? `${descriptionSource.slice(0, 157).trim()}...`
            : descriptionSource;

    return buildSeoMetadata({
        title: product.seo_title || product.name,
        description,
        canonicalPath: `/product/${product.slug}`,
    });
}

export default async function ProductPage({ params }: Props) {
    const { slug } = await params;
    const product = await getProductDetailBySlug(slug);

    return <ProductDetailView product={product} />;
}