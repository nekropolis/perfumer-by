"use client";

import Link from "next/link";
import { useMemo } from "react";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import ProductCard from "@/components/product/product-card";
import type { ProductListItem } from "@/types/catalog";

type SearchBrandItem = {
    id: number;
    name: string;
    slug: string;
    products_count: number;
    score?: number;
};

type SearchResponse = {
    data: {
        brands: SearchBrandItem[];
        products: ProductListItem[];
        suggested_query?: string | null;
    };
    meta?: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
    };
    debug?: {
        query: string;
        normalized_query: string;
        tokens: string[];
        search_patterns: string[];
        product_pool_count: number;
        brand_result_count: number;
        product_result_count: number;
        search_backend?: string;
        search_backend_elapsed_ms?: number;
        total_elapsed_ms?: number;
    } | null;
};

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
                <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700">
                    Ошибка поиска: {error}
                </div>
            ) : null}

            {!error && showBrands && brands.length > 0 ? (
                <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                        Бренды
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {brands.map((brand) => (
                            <Link
                                key={brand.id}
                                href={`/brands/${encodeURIComponent(brand.slug)}`}
                                className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-sm transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)]"
                            >
                                <span className="truncate font-medium">{brand.name}</span>
                                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 text-xs font-medium text-[var(--text-secondary)]">
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
                        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-sm text-[var(--text-secondary)]">
                            <div>Ничего не найдено</div>
                            {suggestedQuery ? (
                                <Link
                                    href={`/search?query=${encodeURIComponent(suggestedQuery)}`}
                                    className="mt-2 inline-block rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                                >
                                    Возможно, вы имели в виду: <span className="font-medium">{suggestedQuery}</span>
                                </Link>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <p className="mb-4 text-sm text-[var(--text-secondary)]">
                                Найдено товаров: <span className="font-medium text-[var(--foreground)]">{totalProducts}</span>
                            </p>
                            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                {products.map((product, index) => (
                                    <ProductCard key={product.id} product={product} eager={index < 4} />
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
                <section className="rounded-3xl border border-[var(--line)] bg-black p-4 text-xs text-white/90">
                    <div className="mb-2 font-semibold">Debug search</div>
                    <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(data.debug, null, 2)}</pre>
                </section>
            ) : null}
        </div>
    );
}
