"use client";

import Image from "next/image";
import Link from "next/link";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import ProductStatusLabels from "@/components/product/product-status-labels";
import type { ProductListItem } from "@/types/catalog";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { applyPercentDiscount, resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";
import { productDisplayName } from "@/lib/product-display-name";

type Props = {
    product: ProductListItem;
    eager?: boolean;
};

function formatPrice(product: ProductListItem) {
    const min = product.price_range?.min;
    const max = product.price_range?.max;

    if (!min && !max) {
        return product.is_preorder_available ? "Предзаказ" : "Цена уточняется";
    }

    const fmtMin = formatMoneyDisplay(min);
    const fmtMax = formatMoneyDisplay(max);

    if (fmtMin && fmtMax && fmtMin !== fmtMax) {
        return `${fmtMin} – ${fmtMax} BYN`;
    }

    return `${fmtMin || fmtMax} BYN`;
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

export default function ProductCard({ product, eager = false }: Props) {
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();

    const rawVariants = normalizeVariantLabels(product.variant_labels);
    const compactVariants = rawVariants.map(compactVariantLabel);
    const visibleVariants = compactVariants.slice(0, 3);
    const hiddenVariantsCount = Math.max(compactVariants.length - 3, 0);

    const imagePath = product.image ? normalizeProductImageUrl(product.image) : null;

    const catalogSwapPaths = Array.isArray(product.catalog_images)
        ? product.catalog_images.filter((p): p is string => typeof p === "string" && p.trim() !== "")
        : [];
    const secondaryImagePath =
        catalogSwapPaths.length >= 2 ? normalizeProductImageUrl(catalogSwapPaths[1]) : null;

    const inWishlist = isInWishlist(product.id);
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const loyaltyMin = applyPercentDiscount(product.price_range?.min, loyaltyCard?.discountPercent ?? 0);
    const loyaltyMax = applyPercentDiscount(product.price_range?.max, loyaltyCard?.discountPercent ?? 0);
    const loyaltyMinFmt = formatMoneyDisplay(loyaltyMin);
    const loyaltyMaxFmt = formatMoneyDisplay(loyaltyMax);

    const loyaltyPriceText =
        loyaltyMinFmt && loyaltyMaxFmt
            ? loyaltyMinFmt !== loyaltyMaxFmt
                ? `${loyaltyMinFmt} – ${loyaltyMaxFmt} BYN`
                : `${loyaltyMinFmt} BYN`
            : null;

    const cardTitle = productDisplayName(product);

    return (
        <Link
            href={`/product/${product.slug}`}
            className="group relative flex flex-col overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] transition-transform duration-150 active:scale-[0.98]"
        >
            {/* ─── IMAGE ZONE ─── */}
            <div className="relative aspect-square w-full overflow-hidden bg-[var(--image-plate)]">

                {/* Status badges */}
                <ProductStatusLabels
                    isNew={Boolean(product.is_new)}
                    isHit={Boolean(product.is_hit)}
                    hasDiscount={Boolean(product.has_discount)}
                />

                {/* Wishlist button */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggleWishlist(product.id);
                    }}
                    aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                    className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 ${inWishlist
                        ? "border-[var(--accent)]/40 bg-[var(--accent)] text-[var(--background)] shadow-sm hover:opacity-95"
                        : "border-[var(--line)] bg-[var(--surface)]/90 text-[var(--foreground)] backdrop-blur hover:bg-[var(--surface-2)]"
                        }`}
                >
                    <span aria-hidden className="text-[13px] leading-none">
                        {inWishlist ? "♥" : "♡"}
                    </span>
                </button>

                {/* Product image */}
                {imagePath ? (
                    <div className="relative h-full w-full p-3">
                        <Image
                            src={imagePath}
                            loader={productImageLoader}
                            alt={cardTitle}
                            fill
                            loading={eager ? "eager" : "lazy"}
                            sizes="(max-width: 640px) 50vw, 280px"
                            className={`object-contain transition duration-300 ${secondaryImagePath
                                ? "group-hover:opacity-0 group-hover:scale-[1.03]"
                                : "group-hover:scale-[1.03]"
                                }`}
                        />
                        {secondaryImagePath && (
                            <Image
                                src={secondaryImagePath}
                                loader={productImageLoader}
                                alt={`${cardTitle} — вид 2`}
                                fill
                                loading="lazy"
                                sizes="(max-width: 640px) 50vw, 280px"
                                className="pointer-events-none absolute inset-0 object-contain opacity-0 transition duration-300 group-hover:opacity-100"
                            />
                        )}
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)]">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            className="h-7 w-7 opacity-40"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 15.75l4.159-4.159a2.25 2.25 0 013.182 0l.409.409a2.25 2.25 0 003.182 0l2.659-2.659a2.25 2.25 0 013.182 0l2.727 2.727M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                            />
                        </svg>
                        <span className="text-[11px] text-[var(--text-secondary)] opacity-60">Нет фото</span>
                    </div>
                )}
            </div>

            {/* ─── INFO ZONE ─── */}
            <div className="flex flex-1 flex-col gap-1.5 border-t border-[var(--line)] p-2.5 pb-3">

                {/* Product name (brand + name on catalog; short name on brand page) */}
                <div className="line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-[1.4] text-[var(--foreground)]">
                    {cardTitle}
                </div>

                {/* Variants */}
                {(visibleVariants.length > 0 || (!product.is_preorder_available && visibleVariants.length === 0)) && (
                    <div className="flex flex-wrap items-center gap-1">
                        {visibleVariants.map((label, i) => (
                            <span
                                key={`${label}-${i}`}
                                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--background)] px-1.5 text-[10px] font-semibold text-[var(--foreground)]"
                            >
                                {label}
                            </span>
                        ))}
                        {hiddenVariantsCount > 0 && (
                            <span className="inline-flex h-5 items-center justify-center rounded-full border border-[var(--line)] px-1.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                +{hiddenVariantsCount}
                            </span>
                        )}
                    </div>
                )}

                {/* ─── FOOTER: price + arrow ─── */}
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                    <div className="min-w-0 origin-left transition-transform duration-150 ease-out">
                        <div className="text-[15px] font-bold leading-none tracking-tight text-[var(--foreground)]">
                            {formatPrice(product)}
                        </div>
                        {isAuthenticated && loyaltyCard && loyaltyPriceText && (
                            <div className="mt-1 text-[10px] font-medium text-emerald-700">
                                По карте: {loyaltyPriceText}
                            </div>
                        )}
                    </div>

                    {/* Arrow button */}
                    <div
                        aria-hidden
                        className="flex h-7 w-7 flex-shrink-0 origin-center items-center justify-center rounded-full bg-[var(--accent)] text-[var(--background)] shadow-sm transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:scale-[1.03]"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="h-3.5 w-3.5"
                        >
                            <path
                                fillRule="evenodd"
                                d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                </div>
            </div>
        </Link>
    );
}