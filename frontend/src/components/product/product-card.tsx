import Image from "next/image";
import Link from "next/link";
import type { ProductListItem } from "@/types/catalog";

type Props = {
    product: ProductListItem;
    showBrand?: boolean;
};

function formatPrice(product: ProductListItem) {
    const min = product.price_range?.min;
    const max = product.price_range?.max;

    if (!min && !max) {
        return product.stock_total > 0 ? "Цена уточняется" : product.is_preorder_available ? "Предзаказ" : "Цена уточняется";
    }

    if (min && max && min !== max) {
        return `${min} – ${max} BYN`;
    }

    return `${min || max} BYN`;
}

function compactVariantLabel(label: string) {
    const match = label.match(/\d+/);
    return match ? match[0] : label;
}

export default function ProductCard({
                                        product,
                                        showBrand = true,
                                    }: Props) {
    const rawVariants = product.variant_labels ?? [];
    const compactVariants = rawVariants.map(compactVariantLabel);

    const visibleVariants = compactVariants.slice(0, 3);
    const hiddenVariantsCount = Math.max(compactVariants.length - 3, 0);

    const imagePath = product.image
        ? product.image.startsWith("http")
            ? product.image
            : `/${product.image.replace(/^\/+/, "")}`
        : null;

    const imageIsRemote = Boolean(
        imagePath?.startsWith("http://") || imagePath?.startsWith("https://")
    );

    const showEmptyVolumeLabel =
        visibleVariants.length === 0 && !product.is_preorder_available;

    return (
        <Link
            href={`/product/${product.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md"
        >
            <div className="relative aspect-[4/3.2] w-full overflow-hidden bg-gray-50">
                {imagePath ? (
                    <Image
                        src={imagePath}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 280px"
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                        unoptimized={imageIsRemote}
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400">
                        <div className="mb-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className="h-7 w-7"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M2.25 15.75l4.159-4.159a2.25 2.25 0 013.182 0l.409.409a2.25 2.25 0 003.182 0l2.659-2.659a2.25 2.25 0 013.182 0l2.727 2.727M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                                />
                            </svg>
                        </div>

                        <span className="text-sm font-medium text-gray-500">
                            Нет фото
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col p-4">
                {showBrand && product.brand?.name && (
                    <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                        {product.brand.name}
                    </div>
                )}

                <div className="mb-3 line-clamp-2 min-h-[56px] text-[15px] font-medium leading-7 text-gray-950">
                    {product.name}
                </div>

                {(visibleVariants.length > 0 || showEmptyVolumeLabel) && (
                    <div className="mb-4 min-h-[28px]">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
                            {visibleVariants.map((label, index) => (
                                <span
                                    key={`${label}-${index}`}
                                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-gray-200 bg-gray-50 px-2 text-[11px] font-medium text-gray-700"
                                >
                                    {label}
                                </span>
                            ))}

                            {hiddenVariantsCount > 0 && (
                                <span className="inline-flex h-6 items-center justify-center rounded-full border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-500">
                                    +{hiddenVariantsCount}
                                </span>
                            )}

                            {showEmptyVolumeLabel && (
                                <span className="text-[11px] text-gray-500">
                                    Объём не указан
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-auto flex items-end justify-between gap-3">
                    <div className="text-lg font-semibold leading-none text-black">
                        {formatPrice(product)}
                    </div>

                    <span className="text-sm font-medium text-black transition group-hover:translate-x-[2px]">
                        →
                    </span>
                </div>
            </div>
        </Link>
    );
}