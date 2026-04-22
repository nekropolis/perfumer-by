import Link from "next/link";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { apiFetch } from "@/lib/api";
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
    };
    debug?: {
        query: string;
        normalized_query: string;
        tokens: string[];
        search_patterns: string[];
        product_pool_count: number;
        brand_result_count: number;
        product_result_count: number;
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

    const brands = data?.data?.brands ?? [];
    const products = data?.data?.products ?? [];

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Поиск" },
                ]}
            />

            <h1 className="text-3xl font-semibold sm:text-4xl">Поиск</h1>
            <p className="mt-2 text-sm text-gray-500">
                Запрос: <span className="font-medium text-gray-900">{query || "—"}</span>
            </p>

            {!query ? (
                <div className="mt-6 rounded-3xl border bg-white px-6 py-10 text-sm text-gray-500">
                    Введите поисковый запрос в шапке сайта и нажмите Enter.
                </div>
            ) : error ? (
                <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700">
                    Ошибка поиска: {error}
                </div>
            ) : (
                <div className="mt-6 space-y-6">
                    {brands.length > 0 ? (
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

                    <section className="rounded-3xl border bg-white p-5">
                        <h2 className="mb-3 text-lg font-semibold">Товары</h2>
                        {products.length === 0 ? (
                            <div className="text-sm text-gray-500">Ничего не найдено</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                {products.map((product) => (
                                    <ProductCard key={product.id} product={product} showBrand />
                                ))}
                            </div>
                        )}
                    </section>

                    {debug && data?.debug ? (
                        <section className="rounded-3xl border bg-black p-4 text-xs text-white/90">
                            <div className="mb-2 font-semibold">Debug search</div>
                            <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(data.debug, null, 2)}</pre>
                        </section>
                    ) : null}
                </div>
            )}
        </main>
    );
}
