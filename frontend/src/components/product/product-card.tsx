"use client";

import Image from "next/image";
import Link from "next/link";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import ProductStatusLabels from "@/components/product/product-status-labels";
import type { ProductListItem } from "@/types/catalog";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { applyPercentDiscount, resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";

type Props = {
    product: ProductListItem;
    showBrand?: boolean;
    eager?: boolean;
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

function normalizeVariantLabels(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }

    if (value && typeof value === "object") {
        return Object.values(value).filter((item): item is string => typeof item === "string");
    }

    if (typeof value === "string") {
        return value.trim() ? [value] : [];
    }

    return [];
}

export default function ProductCard({
                                        product,
                                        showBrand = true,
                                        eager = false,
                                    }: Props) {
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();
    const rawVariants = normalizeVariantLabels(product.variant_labels);
    const compactVariants = rawVariants.map(compactVariantLabel);

    const visibleVariants = compactVariants.slice(0, 3);
    const hiddenVariantsCount = Math.max(compactVariants.length - 3, 0);

    const imagePath = product.image
        ? normalizeProductImageUrl(product.image)
        : null;

    const showEmptyVolumeLabel =
        visibleVariants.length === 0 && !product.is_preorder_available;
    const inWishlist = isInWishlist(product.id);
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const loyaltyMin = applyPercentDiscount(product.price_range?.min, loyaltyCard?.discountPercent ?? 0);
    const loyaltyMax = applyPercentDiscount(product.price_range?.max, loyaltyCard?.discountPercent ?? 0);

    const loyaltyPriceText =
        loyaltyMin && loyaltyMax
            ? loyaltyMin !== loyaltyMax
                ? `${loyaltyMin} – ${loyaltyMax} BYN`
                : `${loyaltyMin} BYN`
            : null;

    return (
        <Link
            href={`/product/${product.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md"
        >
            <div className="relative aspect-video w-full overflow-hidden bg-[var(--background)] sm:aspect-[4/3.2]">
                <ProductStatusLabels
                    isNew={Boolean(product.is_new)}
                    isHit={Boolean(product.is_hit)}
                    hasDiscount={Boolean(product.has_discount)}
                />
                <button
                    type="button"
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void toggleWishlist(product.id);
                    }}
                    aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                    className={`absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition ${
                        inWishlist
                            ? "border-black bg-black text-white hover:bg-gray-900"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                    }`}
                >
                    <span aria-hidden className="text-sm leading-none">
                        {inWishlist ? "♥" : "♡"}
                    </span>
                </button>

                {imagePath ? (
                    <Image
                        src={imagePath}
                        loader={productImageLoader}
                        alt={product.name}
                        fill
                        loading={eager ? "eager" : "lazy"}
                        sizes="(max-width: 640px) min(100vw, 28rem), (max-width: 1024px) 50vw, 280px"
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--surface)] text-[var(--text-secondary)]">
                        <div className="mb-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
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

                        <span className="text-sm font-medium text-[var(--text-secondary)]">
                            Нет фото
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col p-4">
                {showBrand && product.brand?.name && (
                    <div className="mb-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                        {product.brand.name}
                    </div>
                )}

                <div className="mb-3 line-clamp-2 min-h-[56px] text-[15px] font-medium leading-7 text-[var(--foreground)]">
                    {product.name}
                </div>

                {(visibleVariants.length > 0 || showEmptyVolumeLabel) && (
                    <div className="mb-4 min-h-[28px]">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                            {visibleVariants.map((label, index) => (
                                <span
                                    key={`${label}-${index}`}
                                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--background)] px-2 text-[11px] font-medium text-[var(--foreground)]"
                                >
                                    {label}
                                </span>
                            ))}

                            {hiddenVariantsCount > 0 && (
                                <span className="inline-flex h-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--text-secondary)]">
                                    +{hiddenVariantsCount}
                                </span>
                            )}

                            {showEmptyVolumeLabel && (
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                    Объём не указан
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-auto flex items-end justify-between gap-3">
                    <div>
                        <div className="text-lg font-semibold leading-none text-[var(--foreground)]">
                            {formatPrice(product)}
                        </div>
                        {isAuthenticated && loyaltyCard && loyaltyPriceText && (
                            <div className="mt-1 text-xs text-green-700">
                                По карте {loyaltyCard.number}: {loyaltyPriceText}
                            </div>
                        )}
                    </div>

                    <span className="text-sm font-medium text-[var(--foreground)] transition group-hover:translate-x-[2px]">
                        →
                    </span>
                </div>
            </div>
        </Link>
    );
}