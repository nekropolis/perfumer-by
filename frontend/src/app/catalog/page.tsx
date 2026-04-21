import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import { CatalogBrandsResponse, CatalogFiltersResponse, ProductsResponse } from "@/types/catalog";
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
    searchParams?: Promise<Record<string, string | undefined>>;
}) {
    const normalizeList = <T,>(value: unknown): T[] => {
        if (Array.isArray(value)) {
            return value as T[];
        }
        if (value && typeof value === "object") {
            return Object.values(value as Record<string, T>);
        }
        return [];
    };

    const resolvedSearchParams = await searchParams;
    const currentPage = Math.max(1, Number(resolvedSearchParams?.page || "1") || 1);
    const brand = resolvedSearchParams?.brand ? String(resolvedSearchParams.brand) : "";
    const sort = resolvedSearchParams?.sort ? String(resolvedSearchParams.sort) : "price_asc";
    const priceMin = resolvedSearchParams?.price_min ? String(resolvedSearchParams.price_min) : "";
    const priceMax = resolvedSearchParams?.price_max ? String(resolvedSearchParams.price_max) : "";
    const volume = resolvedSearchParams?.volume ? String(resolvedSearchParams.volume) : "";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("sort", sort);
    if (brand) {
        query.set("brand", brand);
    }
    if (priceMin) {
        query.set("price_min", priceMin);
    }
    if (priceMax) {
        query.set("price_max", priceMax);
    }
    if (volume) {
        query.set("volume", volume);
    }
    for (const [key, value] of Object.entries(resolvedSearchParams || {})) {
        if (!key.startsWith("attr_") || !value) {
            continue;
        }
        query.set(key, String(value));
    }

    const filtersQuery = new URLSearchParams();
    if (brand) {
        filtersQuery.set("brand", brand);
    }

    const paginationQuery = new URLSearchParams(query.toString());
    paginationQuery.delete("page");

    const [products, brands, filters] = await Promise.all([
        apiFetch<ProductsResponse>(`/catalog/products?${query.toString()}`),
        apiFetch<CatalogBrandsResponse>("/catalog/brands"),
        apiFetch<CatalogFiltersResponse>(`/catalog/filters${filtersQuery.toString() ? `?${filtersQuery.toString()}` : ""}`),
    ]);

    return (
        <CatalogPageView
            title="Каталог"
            breadcrumbs={[
                { label: "Главная", href: "/" },
                { label: "Каталог" },
            ]}
            products={products}
            brands={brands.data ?? []}
            filters={{
                price: filters.data?.price ?? { min: null, max: null },
                volume: normalizeList(filters.data?.volume),
                attributes: normalizeList(filters.data?.attributes),
            }}
            queryString={paginationQuery.toString()}
            currentPage={currentPage}
            basePath="/catalog"
        />
    );
}
