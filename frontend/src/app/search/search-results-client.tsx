"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProductCard from "@/components/product/product-card";
import { apiFetch } from "@/lib/api";
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
};

type ClientFetchState = {
    forQuery: string;
    data: SearchResponse | null;
    error: string;
};

export default function SearchResultsClient({
    initialQuery,
    initialData,
    initialError,
    debugEnabled,
}: SearchResultsClientProps) {
    const router = useRouter();
    const [query, setQuery] = useState(initialQuery);
    const [loading, setLoading] = useState(false);
    const [fetchState, setFetchState] = useState<ClientFetchState | null>(null);

    const trimmed = query.trim();
    const isEmpty = trimmed.length === 0;
    const isServerQuery = !isEmpty && trimmed === initialQuery.trim();

    const data = isEmpty
        ? null
        : isServerQuery
          ? initialData
          : fetchState?.forQuery === trimmed
            ? fetchState.data
            : null;

    const error = isEmpty
        ? ""
        : isServerQuery
          ? initialError
          : fetchState?.forQuery === trimmed
            ? fetchState.error
            : "";

    useEffect(() => {
        if (isEmpty || isServerQuery) {
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            setLoading(true);

            const sp = new URLSearchParams();
            sp.set("q", trimmed);
            sp.set("limit", "24");
            if (debugEnabled) {
                sp.set("debug", "1");
            }

            void apiFetch<SearchResponse>(`/catalog/products/smart-search?${sp.toString()}`, {
                signal: controller.signal,
            })
                .then((result) => {
                    setFetchState({ forQuery: trimmed, data: result, error: "" });
                })
                .catch((e) => {
                    if ((e as { name?: string })?.name === "AbortError") {
                        return;
                    }
                    setFetchState({
                        forQuery: trimmed,
                        data: null,
                        error: e instanceof Error ? e.message : "Неизвестная ошибка",
                    });
                })
                .finally(() => {
                    setLoading(false);
                });
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [debugEnabled, isEmpty, isServerQuery, trimmed]);

    const brands = useMemo(() => data?.data?.brands ?? [], [data]);
    const products = useMemo(() => data?.data?.products ?? [], [data]);
    const suggestedQuery = data?.data?.suggested_query?.trim() || "";

    return (
        <div className="mt-6 space-y-6">
            <section className="rounded-3xl border bg-white p-5">
                <label htmlFor="search-page-query" className="mb-2 block text-sm font-medium text-gray-700">
                    Быстрый поиск
                </label>
                <input
                    id="search-page-query"
                    type="text"
                    name="search_page_query"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={query}
                    onChange={(event) => {
                        const next = event.target.value;
                        setQuery(next);
                        const params = new URLSearchParams(window.location.search);
                        if (next.trim()) {
                            params.set("query", next.trim());
                        } else {
                            params.delete("query");
                        }
                        if (debugEnabled) {
                            params.set("debug", "1");
                        }
                        router.replace(`/search${params.toString() ? `?${params.toString()}` : ""}`, {
                            scroll: false,
                        });
                    }}
                    placeholder="Начните вводить название, бренд или артикул..."
                    className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
                />
                {loading ? <div className="mt-2 text-xs text-gray-500">Поиск...</div> : null}
            </section>

            {error ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700">
                    Ошибка поиска: {error}
                </div>
            ) : null}

            {!error && brands.length > 0 ? (
                <section className="rounded-3xl border bg-white p-5">
                    <h2 className="mb-3 text-lg font-semibold">Бренды</h2>
                    <div className="space-y-1">
                        {brands.map((brand) => (
                            <Link
                                key={brand.id}
                                href={`/brands/${encodeURIComponent(brand.slug)}`}
                                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm transition hover:bg-gray-50"
                            >
                                <span>{brand.name}</span>
                                <span className="text-gray-500">{brand.products_count}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            {!error ? (
                <section className="rounded-3xl border bg-white p-5">
                    <h2 className="mb-3 text-lg font-semibold">Товары</h2>
                    {products.length === 0 ? (
                        <div className="text-sm text-gray-500">
                            <div>Ничего не найдено</div>
                            {suggestedQuery ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery(suggestedQuery)}
                                    className="mt-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50"
                                >
                                    Возможно, вы имели в виду: <span className="font-medium">{suggestedQuery}</span>
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

            {debugEnabled && data?.debug ? (
                <section className="rounded-3xl border bg-black p-4 text-xs text-white/90">
                    <div className="mb-2 font-semibold">Debug search</div>
                    <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(data.debug, null, 2)}</pre>
                </section>
            ) : null}
        </div>
    );
}
