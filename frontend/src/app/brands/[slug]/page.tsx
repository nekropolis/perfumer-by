import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import { buildBrandProductsQuery } from "@/lib/catalog-listing-query";
import {
    CatalogBrandDetailResponse,
    CatalogBrandsResponse,
    CatalogFiltersResponse,
    ProductsResponse,
} from "@/types/catalog";
import JsonLd from "@/components/seo/json-ld";
import type { Metadata } from "next";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import {
    brandCanonicalPath,
    brandListingFilterActive,
    buildSeoMetadata,
    listingFilterRobots,
    resolveListingPaginationLinks,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
    const resolvedParams = await params;
    const sp = (await searchParams) ?? {};
    const slug = resolvedParams.slug;
    const filtered = brandListingFilterActive(sp);
    const productsQuery = buildBrandProductsQuery(slug, sp);
    const currentPage = Math.max(1, Number(sp.page || "1") || 1);

    const brand = await apiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${slug}`);

    let pagination: Metadata["pagination"] | undefined;
    try {
        const products = await apiFetch<ProductsResponse>(`/catalog/products?${productsQuery.toString()}`);
        const lastPage = Math.max(1, products.meta?.last_page ?? 1);
        pagination = resolveListingPaginationLinks({
            basePath: `/brands/${slug}`,
            query: productsQuery,
            currentPage,
            lastPage,
        });
    } catch {
        pagination = undefined;
    }

    return buildSeoMetadata({
        title: `${brand.data.name} - каталог парфюмерии`,
        description: `Парфюмерия бренда ${brand.data.name}. Актуальные варианты, цены и наличие.`,
        canonicalPath: brandCanonicalPath(brand.data.slug, sp),
        robots: listingFilterRobots(filtered),
        pagination,
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
    const slug = resolvedParams.slug;

    const productsQuery = buildBrandProductsQuery(slug, resolvedSearchParams || {});
    const paginationQuery = new URLSearchParams(productsQuery.toString());
    paginationQuery.delete("page");

    const [brand, products, brands, filters] = await Promise.all([
        apiFetch<CatalogBrandDetailResponse>(`/catalog/brands/${slug}`),
        apiFetch<ProductsResponse>(`/catalog/products?${productsQuery.toString()}`),
        apiFetch<CatalogBrandsResponse>("/catalog/brands"),
        apiFetch<CatalogFiltersResponse>(`/catalog/filters?brand_slug=${slug}`),
    ]);

    const brandCrumbs = [
        { label: "Главная", href: "/" },
        { label: "Бренды", href: "/brands" },
        { label: brand.data.name },
    ] as const;

    return (
        <>
            <JsonLd data={breadcrumbListJsonLd([...brandCrumbs])} />
            <CatalogPageView
                title={brand.data.name}
                breadcrumbs={[...brandCrumbs]}
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
        </>
    );
}
