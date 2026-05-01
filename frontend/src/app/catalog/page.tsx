import { apiFetch } from "@/lib/api";
import CatalogPageView from "@/components/catalog/catalog-page-view";
import JsonLd from "@/components/seo/json-ld";
import { buildCatalogProductsQuery } from "@/lib/catalog-listing-query";
import { CatalogBrandsResponse, CatalogFiltersResponse, ProductsResponse } from "@/types/catalog";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";
import {
    buildSeoMetadata,
    catalogCanonicalPath,
    catalogListingFilterActive,
    listingFilterRobots,
    resolveListingPaginationLinks,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
    const sp = (await searchParams) ?? {};
    const filtered = catalogListingFilterActive(sp);
    const productsQuery = buildCatalogProductsQuery(sp);
    const currentPage = Math.max(1, Number(sp.page || "1") || 1);

    let pagination: Metadata["pagination"] | undefined;
    try {
        const products = await apiFetch<ProductsResponse>(`/catalog/products?${productsQuery.toString()}`);
        const lastPage = Math.max(1, products.meta?.last_page ?? 1);
        pagination = resolveListingPaginationLinks({
            basePath: "/catalog",
            query: productsQuery,
            currentPage,
            lastPage,
        });
    } catch {
        pagination = undefined;
    }

    return buildSeoMetadata({
        title: "Каталог парфюмерии",
        description: "Каталог парфюмерии с выбором брендов, вариантов и цен.",
        canonicalPath: catalogCanonicalPath(sp),
        robots: listingFilterRobots(filtered),
        pagination,
    });
}

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

    const query = buildCatalogProductsQuery(resolvedSearchParams || {});

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

    const catalogCrumbs = [
        { label: "Главная", href: "/" },
        { label: "Каталог" },
    ] as const;

    return (
        <>
            <JsonLd data={breadcrumbListJsonLd([...catalogCrumbs])} />
            <CatalogPageView
                title="Каталог"
                breadcrumbs={[...catalogCrumbs]}
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
        </>
    );
}
