import CatalogPageView from "@/components/catalog/catalog-page-view";
import JsonLd from "@/components/seo/json-ld";
import { fetchCatalogBootstrap } from "@/lib/catalog-api";
import {
    catalogLandingCanonicalPath,
    fetchCatalogLandingBySlug,
    mergeCatalogLandingSearchParams,
} from "@/lib/catalog-landing-api";
import {
    buildCatalogProductsQuery,
    CATALOG_DEFAULT_SORT,
    toPublicListingQueryParams,
} from "@/lib/catalog-listing-query";
import { breadcrumbListJsonLd, catalogCollectionJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
    buildSeoMetadata,
    catalogListingFilterActive,
    listingFilterRobots,
    resolveListingPaginationLinks,
} from "@/lib/seo";

const getCatalogLanding = cache(async (slug: string) => fetchCatalogLandingBySlug(slug));

const getCatalogBootstrap = cache(async (queryString: string) => fetchCatalogBootstrap(queryString));

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
    const { slug } = await params;
    const landing = await getCatalogLanding(slug);
    if (!landing) {
        notFound();
    }

    const urlSp = (await searchParams) ?? {};
    const mergedSp = mergeCatalogLandingSearchParams(landing, urlSp);
    const productsQuery = buildCatalogProductsQuery(mergedSp);
    const currentPage = Math.max(1, Number(urlSp.page || "1") || 1);
    const userFiltered = catalogListingFilterActive(urlSp);

    let pagination: Metadata["pagination"] | undefined;
    try {
        const bootstrap = await getCatalogBootstrap(productsQuery.toString());
        const products = bootstrap.data.products;
        const lastPage = Math.max(1, products.meta?.last_page ?? 1);
        pagination = resolveListingPaginationLinks({
            basePath: `/catalog/${slug}`,
            query: productsQuery,
            currentPage,
            lastPage,
            defaultSort: CATALOG_DEFAULT_SORT,
        });
    } catch {
        pagination = undefined;
    }

    const seoTitle = landing.seo_title?.trim() || landing.h1;
    const seoDescription =
        landing.seo_description?.trim() ||
        `Каталог парфюмерии: ${landing.h1}. Актуальные цены и наличие.`;

    return buildSeoMetadata({
        title: seoTitle,
        description: seoDescription,
        canonicalPath: catalogLandingCanonicalPath(slug, urlSp),
        robots: listingFilterRobots(userFiltered),
        pagination,
    });
}

export default async function CatalogLandingPage({
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

    const { slug } = await params;
    const landing = await getCatalogLanding(slug);
    if (!landing) {
        notFound();
    }

    const urlSp = (await searchParams) ?? {};
    const mergedSp = mergeCatalogLandingSearchParams(landing, urlSp);
    const currentPage = Math.max(1, Number(urlSp.page || "1") || 1);
    const query = buildCatalogProductsQuery(mergedSp);
    const paginationQuery = toPublicListingQueryParams(query, { defaultSort: CATALOG_DEFAULT_SORT });
    paginationQuery.delete("page");

    const bootstrap = await getCatalogBootstrap(query.toString());
    const products = bootstrap.data.products;
    const brands = bootstrap.data.brands;
    const filters = bootstrap.data.filters;
    const canonicalPath = catalogLandingCanonicalPath(slug, urlSp);
    const basePath = `/catalog/${slug}`;

    const catalogCrumbs = [
        { label: "Главная", href: "/" },
        { label: "Каталог", href: "/catalog" },
        { label: landing.h1 },
    ] as const;

    return (
        <>
            <JsonLd
                data={[
                    breadcrumbListJsonLd([...catalogCrumbs]),
                    catalogCollectionJsonLd({
                        name: landing.h1,
                        description: landing.seo_description?.trim() || seoDescriptionFallback(landing.h1),
                        urlPath: canonicalPath,
                        products: products.data ?? [],
                    }),
                ]}
            />
            <CatalogPageView
                title={landing.h1}
                breadcrumbs={[...catalogCrumbs]}
                products={products}
                brands={brands.data ?? []}
                filters={{
                    price: filters.data?.price ?? { min: null, max: null },
                    volume: normalizeList(filters.data?.volume),
                    attributes: normalizeList(filters.data?.attributes),
                }}
                queryString={paginationQuery.toString()}
                searchQueryString={query.toString()}
                currentPage={currentPage}
                basePath={basePath}
                footerDescriptionHtml={landing.content}
            />
        </>
    );
}

function seoDescriptionFallback(h1: string): string {
    return `Каталог парфюмерии: ${h1}. Актуальные цены и наличие.`;
}
