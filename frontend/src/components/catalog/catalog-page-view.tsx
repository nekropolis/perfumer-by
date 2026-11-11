import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import CatalogMobileFiltersDrawer from "@/components/catalog/catalog-mobile-filters-drawer";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import CatalogGridToolbar from "@/components/catalog/catalog-grid-toolbar";
import { CatalogNavigationProvider } from "@/components/catalog/catalog-navigation";
import { CatalogSearchParamsProvider } from "@/components/catalog/catalog-search-params";
import CatalogResultsOverlay from "@/components/catalog/catalog-results-overlay";
import ProductCard from "@/components/product/product-card";
import { collapseDuplicateListingProducts } from "@/lib/product-card-utils";
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
    const listingProducts = collapseDuplicateListingProducts(products.data);
    const productsTotal = products.meta?.total ?? listingProducts.length;
    const showCategoryChips = basePath === "/catalog" || basePath.startsWith("/brands/");
    const showResetFilters = showBrand;
    const isRootCatalog = basePath === "/catalog";
    // На корневом каталоге таб «Каталог» уже даёт контекст — на мобиле прячем UI, H1/intro оставляем для SEO.
    const compactMobileHeader = isRootCatalog;

    return (
        <main className="mx-auto max-w-7xl px-4 py-2 pb-8 sm:px-6 md:py-8 md:pb-12 lg:px-8 max-lg:landscape:py-4 max-lg:landscape:pb-8">
            <Breadcrumbs
                className={`mb-1 md:mb-4 max-lg:landscape:mb-2 ${compactMobileHeader ? "hidden md:block" : ""}`}
                items={breadcrumbs}
            />

            <div className={compactMobileHeader ? "mb-0 md:mb-6" : "mb-2 md:mb-6 max-lg:landscape:mb-3"}>
                <h1
                    className={
                        compactMobileHeader
                            ? "sr-only md:not-sr-only md:mb-0 md:text-3xl md:font-semibold md:leading-tight lg:text-4xl"
                            : "text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl max-lg:landscape:text-2xl"
                    }
                >
                    {title}
                </h1>
                {intro?.trim() ? (
                    <p
                        className={
                            compactMobileHeader
                                ? "sr-only md:not-sr-only md:mt-3 md:max-w-3xl md:text-base md:leading-6 md:text-admin-text-secondary"
                                : "mt-3 hidden max-w-3xl text-sm leading-6 text-admin-text-secondary md:block sm:text-base"
                        }
                    >
                        {intro}
                    </p>
                ) : null}
                {!compactMobileHeader && intro?.trim() ? (
                    <details className="mt-1 md:hidden">
                        <summary className="cursor-pointer text-sm font-medium text-admin-text-secondary">Подробнее</summary>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-admin-text-secondary">{intro}</p>
                    </details>
                ) : null}
            </div>

            <CatalogSearchParamsProvider queryString={searchQueryString}>
                <CatalogNavigationProvider>
                    <CatalogGridToolbar
                        basePath={basePath}
                        brands={brands}
                        attributes={filters.attributes}
                        showCategoryChips={showCategoryChips}
                        showResetFilters={showResetFilters}
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

                    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)] max-lg:landscape:mt-3">
                        <aside className="hidden self-start lg:block">
                            <div className="rounded-xl border border-admin-border bg-admin-surface p-5 shadow-sm">
                                <CatalogFilters
                                    brands={brands}
                                    basePath={basePath}
                                    showBrandFilter={showBrand}
                                    attributes={filters.attributes}
                                    priceRange={filters.price}
                                    volumeOptions={filters.volume}
                                    hideReset={!showResetFilters}
                                />
                            </div>
                        </aside>

                    <section className="min-w-0">
                        <div className="mb-4 text-sm text-admin-text-secondary max-lg:landscape:mb-2">
                            Найдено: {productsTotal} {productsCountLabel(productsTotal)}
                        </div>

                        <div className="relative">
                            <CatalogResultsOverlay />

                            {listingProducts.length > 0 ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 md:gap-2 lg:grid-cols-4 lg:gap-4">
                                        {listingProducts.map((product, index) => (
                                            <ProductCard
                                                key={product.id}
                                                product={product}
                                                eager={index < 2}
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
