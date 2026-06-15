import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import { apiFetch } from "@/lib/api";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import { siteCard } from "@/lib/site-ui-classes";
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

function parsePage(raw: string | undefined): number {
    const page = Number.parseInt(raw ?? "1", 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams?: Promise<{ query?: string; page?: string; debug?: string }>;
}) {
    const params = await searchParams;
    const query = (params?.query || "").trim();
    const currentPage = parsePage(params?.page);
    const debug = params?.debug === "1";

    let data: SearchResponse | null = null;
    let error = "";

    if (query) {
        try {
            const sp = new URLSearchParams();
            sp.set("q", query);
            sp.set("limit", "24");
            sp.set("page", String(currentPage));
            if (debug) {
                sp.set("debug", "1");
            }
            data = await apiFetch<SearchResponse>(`/catalog/products/smart-search?${sp.toString()}`);
        } catch (e) {
            error = e instanceof Error ? e.message : "Неизвестная ошибка";
        }
    }

    const paginationQuery = new URLSearchParams();
    if (query) {
        paginationQuery.set("query", query);
    }
    if (debug) {
        paginationQuery.set("debug", "1");
    }

    const crumbs = [
        { label: "Главная", href: "/" },
        { label: "Поиск" },
    ] as const;

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
                <JsonLd data={breadcrumbListJsonLd([...crumbs])} />
                <Breadcrumbs className="mb-4" items={[...crumbs]} />

                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {query ? (
                        <>
                            Поиск: <span className="text-admin-text-secondary">{query}</span>
                        </>
                    ) : (
                        "Поиск"
                    )}
                </h1>

                {!query ? (
                    <div className={`${siteCard} mt-6 px-6 py-10 text-sm text-admin-text-secondary`}>
                        Введите поисковый запрос в шапке сайта и нажмите Enter.
                    </div>
                ) : null}

                <SearchResultsClient
                    key={`${query}:${currentPage}`}
                    initialQuery={query}
                    initialData={data}
                    initialError={error}
                    debugEnabled={debug}
                    currentPage={currentPage}
                    queryString={paginationQuery.toString()}
                />
            </div>
        </main>
    );
}
