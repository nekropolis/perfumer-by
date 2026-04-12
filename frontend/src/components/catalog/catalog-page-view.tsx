import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import CatalogPagination from "@/components/catalog/catalog-pagination";
import ProductCard from "@/components/catalog/product-card";
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
    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
            <Breadcrumbs className="mb-4" items={breadcrumbs} />

            <h1 className="mb-8 text-3xl font-semibold">{title}</h1>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside>
                    <CatalogFilters />
                </aside>

                <div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                        {products.data.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>

                    <CatalogPagination
                        currentPage={currentPage}
                        lastPage={products.meta.last_page}
                        basePath={basePath}
                    />
                </div>
            </div>
        </main>
    );
}
