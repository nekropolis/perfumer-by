import Link from "next/link";
import type { ProductListItem } from "@/types/catalog";

type Props = {
    product: ProductListItem;
};

function formatPrice(product: ProductListItem) {
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

export default function ProductCard({ product }: Props) {
    const visibleVariants = product.variant_labels?.slice(0, 2) ?? [];
    const hiddenVariantsCount = Math.max((product.variant_labels?.length ?? 0) - 2, 0);

    return (
        <Link
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

                <div className="mt-auto text-base font-semibold text-gray-950">
                    {formatPrice(product)}
                </div>
            </div>
        </Link>
    );
}
