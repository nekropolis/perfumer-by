import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import ProductCard from "@/components/product/product-card";
import type { ProductsResponse } from "@/types/catalog";

type BreadcrumbItem = {
    label: string;
    href?: string;
};

type Props = {
    title: string;
    breadcrumbs: BreadcrumbItem[];
    products: ProductsResponse;
    currentPage: number;
    basePath: string;
};

export default function CatalogPageView({
                                            title,
                                            breadcrumbs,
                                            products,
                                            currentPage,
                                            basePath,
                                        }: Props) {
    const total = products.meta?.total ?? products.data.length;
    const lastPage = products.meta?.last_page ?? 1;
    const showBrand = !basePath.includes("/brands/");

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <Breadcrumbs className="mb-4" items={breadcrumbs} />

            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                        {title}
                    </h1>

                    <p className="mt-2 text-sm text-gray-500">
                        Найдено товаров: {total}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="self-start xl:sticky xl:top-24">
                    <div className="rounded-3xl border bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-lg font-semibold">Фильтры</div>
                        </div>

                        <CatalogFilters />
                    </div>
                </aside>

                <section className="min-w-0">
                    {products.data.length > 0 ? (
                        <>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                {products.data.map((product) => (
                                    <ProductCard key={product.id} product={product} showBrand={showBrand} />
                                ))}
                            </div>

                            <div className="mt-8">
                                <CatalogPagination
                                    currentPage={currentPage}
                                    lastPage={lastPage}
                                    basePath={basePath}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="rounded-3xl border bg-white px-6 py-12 text-center">
                            <div className="mb-2 text-2xl font-semibold">
                                Ничего не найдено
                            </div>

                            <p className="mx-auto max-w-md text-sm leading-6 text-gray-500">
                                Попробуйте изменить фильтры или перейти в общий каталог,
                                чтобы посмотреть другие товары.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}