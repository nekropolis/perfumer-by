import { apiFetch } from "@/lib/api";
import type { ProductDetailResponse } from "@/types/catalog";
import ProductDetailView from "@/components/product/product-detail-view";
import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo";

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
    const response = await apiFetch<ProductDetailResponse>(
        `/catalog/products/${resolvedParams.slug}`
    );

    const product = response.data;

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

    const response = await apiFetch<ProductDetailResponse>(`/catalog/products/${slug}`);

    return <ProductDetailView product={response.data} />;
}