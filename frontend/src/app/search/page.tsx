import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import { apiFetch } from "@/lib/api";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import type { ProductListItem } from "@/types/catalog";
import SearchResultsClient from "@/app/search/search-results-client";

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

export default async function SearchPage({
    searchParams,
}: {
    searchParams?: Promise<{ query?: string; debug?: string }>;
}) {
    const params = await searchParams;
    const query = (params?.query || "").trim();
    const debug = params?.debug === "1";

    let data: SearchResponse | null = null;
    let error = "";

    if (query) {
        try {
            const sp = new URLSearchParams();
            sp.set("q", query);
            sp.set("limit", "24");
            if (debug) {
                sp.set("debug", "1");
            }
            data = await apiFetch<SearchResponse>(`/catalog/products/smart-search?${sp.toString()}`);
        } catch (e) {
            error = e instanceof Error ? e.message : "Неизвестная ошибка";
        }
    }

    const crumbs = [
        { label: "Главная", href: "/" },
        { label: "Поиск" },
    ] as const;

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <JsonLd data={breadcrumbListJsonLd([...crumbs])} />
            <Breadcrumbs className="mb-4" items={[...crumbs]} />

            <h1 className="text-3xl font-semibold sm:text-4xl">Поиск</h1>
            <p className="mt-2 text-sm text-gray-500">
                Запрос: <span className="font-medium text-gray-900">{query || "—"}</span>
            </p>

            {!query ? (
                <div className="mt-6 rounded-3xl border bg-white px-6 py-10 text-sm text-gray-500">
                    Введите поисковый запрос в шапке сайта и нажмите Enter.
                </div>
            ) : null}

            <SearchResultsClient
                key={query}
                initialQuery={query}
                initialData={data}
                initialError={error}
                debugEnabled={debug}
            />
        </main>
    );
}
