import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import {
    CatalogBrandDetailResponse,
    CatalogBrandsResponse,
    CatalogFiltersResponse,
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

    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const currentPage = Math.max(1, Number(resolvedSearchParams?.page || "1") || 1);
    const sort = resolvedSearchParams?.sort ? String(resolvedSearchParams.sort) : "price_asc";
    const priceMin = resolvedSearchParams?.price_min ? String(resolvedSearchParams.price_min) : "";
    const priceMax = resolvedSearchParams?.price_max ? String(resolvedSearchParams.price_max) : "";
    const volume = resolvedSearchParams?.volume ? String(resolvedSearchParams.volume) : "";
    const slug = resolvedParams.slug;

    const productsQuery = new URLSearchParams();
    productsQuery.set("page", String(currentPage));
    productsQuery.set("brand_slug", slug);
    productsQuery.set("sort", sort);
    if (priceMin) {
        productsQuery.set("price_min", priceMin);
    }
    if (priceMax) {
        productsQuery.set("price_max", priceMax);
    }
    if (volume) {
        productsQuery.set("volume", volume);
    }
    for (const [key, value] of Object.entries(resolvedSearchParams || {})) {
        if (!key.startsWith("attr_") || !value) {
            continue;
        }
        productsQuery.set(key, String(value));
    }
    const paginationQuery = new URLSearchParams(productsQuery.toString());
    paginationQuery.delete("page");

    const [brand, products, brands, filters] = await Promise.all([
        apiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${slug}`),
        apiFetch<ProductsResponse>(`/catalog/products?${productsQuery.toString()}`),
        apiFetch<CatalogBrandsResponse>("/catalog/brands"),
        apiFetch<CatalogFiltersResponse>(`/catalog/filters?brand_slug=${slug}`),
    ]);

    return (
        <CatalogPageView
            title={brand.data.name}
            breadcrumbs={[
                { label: "Главная", href: "/" },
                { label: "Бренды", href: "/brands" },
                { label: brand.data.name },
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
            basePath={`/brands/${slug}`}
        />
    );
}
