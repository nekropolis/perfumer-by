"use client";

import Link from "next/link";
import { useMemo } from "react";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import ProductCardClient from "@/components/product/product-card.client";
import {
    siteBtnSecondary,
    siteCard,
    siteFilterChip,
    siteFilterChipInactive,
} from "@/lib/site-ui-classes";
import type { ProductListItem } from "@/types/catalog";
import type { SearchResponse } from "@/types/search";

type SearchResultsClientProps = {
    initialQuery: string;
    initialData: SearchResponse | null;
    initialError: string;
    debugEnabled: boolean;
    currentPage: number;
    queryString: string;
};

export default function SearchResultsClient({
    initialQuery,
    initialData,
    initialError,
    debugEnabled,
    currentPage,
    queryString,
}: SearchResultsClientProps) {
    const data = initialData;
    const error = initialError;

    const brands = useMemo(() => data?.data?.brands ?? [], [data]);
    const products = useMemo(() => data?.data?.products ?? [], [data]);
    const suggestedQuery = data?.data?.suggested_query?.trim() || "";
    const lastPage = data?.meta?.last_page ?? 1;
    const totalProducts = data?.meta?.total ?? products.length;
    const showBrands = currentPage <= 1;

    if (!initialQuery) {
        return null;
    }

    return (
        <div className="mt-6 space-y-6">
            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700">
                    Ошибка поиска: {error}
                </div>
            ) : null}

            {!error && showBrands && brands.length > 0 ? (
                <section>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Бренды
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {brands.map((brand) => (
                            <Link
                                key={brand.id}
                                href={`/brands/${encodeURIComponent(brand.slug)}`}
                                className={`${siteFilterChip} ${siteFilterChipInactive} gap-2`}
                            >
                                <span className="truncate font-medium">{brand.name}</span>
                                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-admin-muted px-1.5 text-xs font-medium text-admin-text-secondary">
                                    {brand.products_count}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            {!error ? (
                <section>
                    {products.length === 0 ? (
                        <div className={`${siteCard} px-6 py-10 text-sm text-admin-text-secondary`}>
                            <div>Ничего не найдено</div>
                            {suggestedQuery ? (
                                <Link
                                    href={`/search?query=${encodeURIComponent(suggestedQuery)}`}
                                    className={`${siteBtnSecondary} mt-3 inline-flex`}
                                >
                                    Возможно, вы имели в виду: <span className="font-medium">{suggestedQuery}</span>
                                </Link>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <p className="mb-4 text-sm text-admin-text-secondary">
                                Найдено товаров:{" "}
                                <span className="font-medium text-admin-text">{totalProducts}</span>
                            </p>
                            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                {products.map((product, index) => (
                                    <ProductCardClient key={product.id} product={product} eager={index < 4} />
                                ))}
                            </div>
                            <CatalogPagination
                                currentPage={currentPage}
                                lastPage={lastPage}
                                basePath="/search"
                                queryString={queryString}
                            />
                        </>
                    )}
                </section>
            ) : null}

            {debugEnabled && data?.debug ? (
                <section className="rounded-xl border border-admin-border bg-admin-text p-4 text-xs text-white/90">
                    <div className="mb-2 font-semibold">Debug search</div>
                    <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(data.debug, null, 2)}</pre>
                </section>
            ) : null}
        </div>
    );
}
