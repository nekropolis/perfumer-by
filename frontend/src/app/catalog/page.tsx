import CatalogPageView from "@/components/catalog/catalog-page-view";
import JsonLd from "@/components/seo/json-ld";
import { fetchCatalogBootstrap } from "@/lib/catalog-api";
import { buildCatalogProductsQuery } from "@/lib/catalog-listing-query";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";
import { cache } from "react";
import {
    buildSeoMetadata,
    catalogCanonicalPath,
    catalogListingFilterActive,
    listingFilterRobots,
    resolveListingPaginationLinks,
} from "@/lib/seo";
import { getCatalogPageCopy } from "@/lib/catalog-page-copy";

/** Дедупликация fetch между generateMetadata и страницей (один запрос на query). */
const getCatalogBootstrap = cache(async (queryString: string) => fetchCatalogBootstrap(queryString));

export async function generateMetadata({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
    const sp = (await searchParams) ?? {};
    const filtered = catalogListingFilterActive(sp);
    const productsQuery = buildCatalogProductsQuery(sp);
    const currentPage = Math.max(1, Number(sp.page || "1") || 1);
    const pageCopy = getCatalogPageCopy(sp);

    let pagination: Metadata["pagination"] | undefined;
    try {
        const bootstrap = await getCatalogBootstrap(productsQuery.toString());
        const products = bootstrap.data.products;
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
        title: pageCopy.title,
        description: pageCopy.description,
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

    const query = buildCatalogProductsQuery(resolvedSearchParams || {});

    const paginationQuery = new URLSearchParams(query.toString());
    paginationQuery.delete("page");

    const bootstrap = await getCatalogBootstrap(query.toString());
    const products = bootstrap.data.products;
    const brands = bootstrap.data.brands;
    const filters = bootstrap.data.filters;
    const pageCopy = getCatalogPageCopy(resolvedSearchParams || {});

    const catalogCrumbs = [
        { label: "Главная", href: "/" },
        { label: pageCopy.breadcrumb },
    ] as const;

    return (
        <>
            <JsonLd data={breadcrumbListJsonLd([...catalogCrumbs])} />
            <CatalogPageView
                title={pageCopy.title}
                intro={pageCopy.intro}
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
