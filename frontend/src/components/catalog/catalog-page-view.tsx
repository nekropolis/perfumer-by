import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import CatalogMobileFiltersDrawer from "@/components/catalog/catalog-mobile-filters-drawer";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import CatalogGridToolbar from "@/components/catalog/catalog-grid-toolbar";
import ProductCard from "@/components/product/product-card";
import type { CatalogBrandItem, CatalogFilterAttribute, ProductsResponse } from "@/types/catalog";

type BreadcrumbItem = {
    label: string;
    href?: string;
};

type Props = {
    title: string;
    breadcrumbs: BreadcrumbItem[];
    products: ProductsResponse;
    brands: CatalogBrandItem[];
    filters: {
        price: {
            min: number | null;
            max: number | null;
        };
        volume: {
            key: string;
            label: string;
            products_count: number;
        }[];
        attributes: CatalogFilterAttribute[];
    };
    queryString: string;
    currentPage: number;
    basePath: string;
    footerDescriptionHtml?: string | null;
};

export default function CatalogPageView({
                                            title,
                                            breadcrumbs,
                                            products,
                                            brands,
                                            filters,
                                            queryString,
                                            currentPage,
                                            basePath,
                                            footerDescriptionHtml,
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

                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Найдено товаров: {total}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="hidden self-start lg:block">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
                        <CatalogFilters
                            brands={brands}
                            basePath={basePath}
                            showBrandFilter={showBrand}
                            attributes={filters.attributes}
                            priceRange={filters.price}
                            volumeOptions={filters.volume}
                        />
                    </div>
                </aside>

                <section className="min-w-0">
                    <CatalogGridToolbar
                        basePath={basePath}
                        brands={brands}
                        attributes={filters.attributes}
                        mobileRightAction={
                            <CatalogMobileFiltersDrawer
                                compact
                                brands={brands}
                                basePath={basePath}
                                showBrandFilter={showBrand}
                                attributes={filters.attributes}
                                priceRange={filters.price}
                                volumeOptions={filters.volume}
                            />
                        }
                    />

                    {products.data.length > 0 ? (
                        <>
                            <div className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                {products.data.map((product, index) => (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        eager={index < 4}
                                    />
                                ))}
                            </div>

                            <div className="mt-8">
                                <CatalogPagination
                                    currentPage={currentPage}
                                    lastPage={lastPage}
                                    basePath={basePath}
                                    queryString={queryString}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
                            <div className="mb-2 text-2xl font-semibold">
                                Ничего не найдено
                            </div>

                            <p className="mx-auto max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                                Попробуйте изменить фильтры или перейти в общий каталог,
                                чтобы посмотреть другие товары.
                            </p>
                        </div>
                    )}
                </section>
            </div>

            {footerDescriptionHtml?.trim() ? (
                <section className="mt-10 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
                    <div
                        className="prose prose-sm max-w-none text-[var(--foreground)] sm:prose-base"
                        dangerouslySetInnerHTML={{ __html: footerDescriptionHtml }}
                    />
                </section>
            ) : null}
        </main>
    );
}