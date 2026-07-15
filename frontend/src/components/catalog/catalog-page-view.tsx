import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import CatalogMobileFiltersDrawer from "@/components/catalog/catalog-mobile-filters-drawer";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import CatalogGridToolbar from "@/components/catalog/catalog-grid-toolbar";
import { CatalogNavigationProvider } from "@/components/catalog/catalog-navigation";
import { CatalogSearchParamsProvider } from "@/components/catalog/catalog-search-params";
import CatalogResultsOverlay from "@/components/catalog/catalog-results-overlay";
import ProductCard from "@/components/product/product-card";
import type { CatalogBrandItem, CatalogFilterAttribute, ProductsResponse } from "@/types/catalog";

type BreadcrumbItem = {
    label: string;
    href?: string;
};

type Props = {
    title: string;
    intro?: string | null;
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
    searchQueryString: string;
    currentPage: number;
    basePath: string;
    footerDescriptionHtml?: string | null;
};

function productsCountLabel(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return "товар";
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return "товара";
    }
    return "товаров";
}

export default function CatalogPageView({
    title,
    intro,
    breadcrumbs,
    products,
    brands,
    filters,
    queryString,
    searchQueryString,
    currentPage,
    basePath,
    footerDescriptionHtml,
}: Props) {
    const lastPage = products.meta?.last_page ?? 1;
    const showBrand = !basePath.includes("/brands/");
    const productsTotal = products.meta?.total ?? products.data.length;
    const showCategoryChips = basePath === "/catalog";

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <Breadcrumbs className="mb-4" items={breadcrumbs} />

            <div className="mb-6">
                <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
                {intro?.trim() ? (
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-admin-text-secondary sm:text-base">
                        {intro}
                    </p>
                ) : null}
            </div>

            <CatalogSearchParamsProvider queryString={searchQueryString}>
                <CatalogNavigationProvider>
                    <CatalogGridToolbar
                        basePath={basePath}
                        brands={brands}
                        attributes={filters.attributes}
                        showCategoryChips={showCategoryChips}
                        mobileRightAction={
                            <CatalogMobileFiltersDrawer
                                compact
                                productsCount={productsTotal}
                                brands={brands}
                                basePath={basePath}
                                showBrandFilter={showBrand}
                                attributes={filters.attributes}
                                priceRange={filters.price}
                                volumeOptions={filters.volume}
                            />
                        }
                    />

                    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="hidden self-start lg:block">
                            <div className="rounded-xl border border-admin-border bg-admin-surface p-5 shadow-sm">
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
                        <div className="mb-4 text-sm text-admin-text-secondary">
                            Найдено: {productsTotal} {productsCountLabel(productsTotal)}
                        </div>

                        <div className="relative">
                            <CatalogResultsOverlay />

                            {products.data.length > 0 ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
                                        {products.data.map((product, index) => (
                                            <ProductCard
                                                key={
                                                    product.listing_variant_id
                                                        ? `${product.id}-${product.listing_variant_id}`
                                                        : product.id
                                                }
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
                                    <div className="mb-2 text-2xl font-semibold">Ничего не найдено</div>

                                    <p className="mx-auto max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                                        Попробуйте изменить фильтры или перейти в общий каталог,
                                        чтобы посмотреть другие товары.
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
                </CatalogNavigationProvider>
            </CatalogSearchParamsProvider>

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
