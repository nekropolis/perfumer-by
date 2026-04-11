import Link from "next/link";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import CatalogFilters from "@/components/catalog/catalog-filters";
import type { CatalogBrandItem, ProductsResponse } from "@/types/catalog";

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
    selectedBrandId?: string;
};

function formatPrice(product: ProductsResponse["data"][number]) {
    const min = product.price_range?.min;
    const max = product.price_range?.max;

    if (!min && !max) {
        return "Предзаказ";
    }

    if (min && max && min !== max) {
        return `${min} – ${max} BYN`;
    }

    return `${min || max} BYN`;
}

export default function CatalogPageView({
                                            title,
                                            breadcrumbs,
                                            products,
                                            currentPage,
                                            basePath,
                                            selectedBrandId,
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
                        {products.data.map((product) => {
                            const visibleVariants = product.variant_labels?.slice(0, 2) ?? [];
                            const hiddenVariantsCount = Math.max((product.variant_labels?.length ?? 0) - 2, 0);

                            return (
                                <Link
                                    key={product.id}
                                    href={`/product/${product.slug}`}
                                    className="block h-full overflow-hidden rounded-2xl border bg-white transition hover:shadow-sm"
                                >
                                    <div className="aspect-[5/4] w-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                        {product.image ? (
                                            <img
                                                src={product.image}
                                                alt={product.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <span>Нет фото</span>
                                        )}
                                    </div>

                                    <div className="flex min-h-[150px] flex-col p-3">
                                        <div className="mb-2 line-clamp-2 min-h-[40px] text-sm font-medium leading-5 text-gray-900">
                                            {product.name}
                                        </div>

                                        <div className="mb-3 flex min-h-[44px] flex-wrap content-start gap-1.5">
                                            {visibleVariants.length > 0 ? (
                                                <>
                                                    {visibleVariants.map((label) => (
                                                        <span
                                                            key={label}
                                                            className="rounded-md border px-2 py-1 text-[11px] leading-none text-gray-700"
                                                        >
                                                            {label}
                                                        </span>
                                                    ))}

                                                    {hiddenVariantsCount > 0 && (
                                                        <span className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-medium leading-none text-gray-500">
                                                            +{hiddenVariantsCount}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="rounded-md border px-2 py-1 text-[11px] leading-none text-gray-500">
                                                    Объём не указан
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-aut
o text-base font-semibold text-gray-950">
                                            {formatPrice(product)}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {products.meta.last_page > 1 && (
                        <div className="mt-8 flex items-center justify-center gap-2">
                            <Link
                                href={`${basePath}?page=${Math.max(1, currentPage - 1)}`}
                                className={`rounded-lg border px-3 py-2 text-sm ${
                                    currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                                }`}
                            >
                                Назад
                            </Link>

                            {Array.from({ length: products.meta.last_page }, (_, index) => index + 1)
                                .slice(Math.max(0, currentPage - 3), Math.min(products.meta.last_page, currentPage + 2))
                                .map((page) => (
                                    <Link
                                        key={page}
                                        href={`${basePath}?page=${page}`}
                                        className={`rounded-lg px-3 py-2 text-sm border ${
                                            page === currentPage
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-black"
                                        }`}
                                    >
                                        {page}
                                    </Link>
                                ))}

                            <Link
                                href={`${basePath}?page=${Math.min(products.meta.last_page, currentPage + 1)}`}
                                className={`rounded-lg border px-3 py-2 text-sm ${
                                    currentPage >= products.meta.last_page ? "pointer-events-none opacity-50" : ""
                                }`}
                            >
                                Вперёд
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
