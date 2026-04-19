import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import { ProductsResponse } from "@/types/catalog";
import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildSeoMetadata({
    title: "Каталог парфюмерии",
    description: "Каталог парфюмерии с выбором брендов, вариантов и цен.",
    canonicalPath: "/catalog",
});

export default async function CatalogPage({
                                              searchParams,
                                          }: {
    searchParams?: Promise<{ page?: string }>;
}) {
    const resolvedSearchParams = await searchParams;
    const currentPage = Math.max(1, Number(resolvedSearchParams?.page || "1") || 1);

    const products = await apiFetch<ProductsResponse>(`/catalog/products?page=${currentPage}`);

    return (
        <CatalogPageView
            title="Каталог"
            breadcrumbs={[
                { label: "Главная", href: "/" },
                { label: "Каталог" },
            ]}
            products={products}
            currentPage={currentPage}
            basePath="/catalog"
        />
    );
}
