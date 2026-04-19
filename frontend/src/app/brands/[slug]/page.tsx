import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import {
    CatalogBrandDetailResponse,
    ProductsResponse,
} from "@/types/catalog";
import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
                                           params,
                                       }: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const resolvedParams = await params;
    const brand = await apiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${resolvedParams.slug}`);

    return buildSeoMetadata({
        title: `${brand.data.name} - каталог парфюмерии`,
        description: `Парфюмерия бренда ${brand.data.name}. Актуальные варианты, цены и наличие.`,
        canonicalPath: `/brands/${brand.data.slug}`,
    });
}

export default async function BrandPage({
                                            params,
                                            searchParams,
                                        }: {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<{ page?: string }>;
}) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const currentPage = Math.max(1, Number(resolvedSearchParams?.page || "1") || 1);
    const slug = resolvedParams.slug;

    const brand = await apiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${slug}`);
    const products = await apiFetch<ProductsResponse>(
        `/catalog/products?page=${currentPage}&brand_slug=${slug}`
    );

    return (
        <CatalogPageView
            title={brand.data.name}
            breadcrumbs={[
                { label: "Главная", href: "/" },
                { label: "Бренды", href: "/brands" },
                { label: brand.data.name },
            ]}
            products={products}
            currentPage={currentPage}
            basePath={`/brands/${slug}`}
        />
    );
}
