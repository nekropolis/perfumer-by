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
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    product: ProductListItem;
    eager?: boolean;
    variant?: "catalog" | "featured";
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

function formatOldPrice(product: ProductListItem) {
    if (!product.has_discount) {
        return null;
    }

    const min = product.old_price_range?.min;
    const max = product.old_price_range?.max;

    if (!min && !max) {
        return null;
    }

    const fmtMin = formatMoneyDisplay(min);
    const fmtMax = formatMoneyDisplay(max);

    if (fmtMin && fmtMax && fmtMin !== fmtMax) {
        return `${fmtMin} – ${fmtMax} BYN`;
    }

    return fmtMin || fmtMax;
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

export default function ProductCard({ product, eager = false, variant = "catalog" }: Props) {
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();

    const showVariants = variant === "catalog";
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
    const presetDisplayName = product.display_name?.trim();
    const brandName = product.brand?.name?.trim() ?? "";
    const showBrandLine = Boolean(brandName) && !presetDisplayName;
    const productTitle = presetDisplayName || product.name.trim() || brandName || cardTitle;
    const oldPrice = formatOldPrice(product);

    return (
        <Link
            href={`/product/${product.slug}`}
            className={`${siteCard} group relative flex h-full min-w-0 flex-col p-3 transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md active:scale-[0.99] sm:p-4`}
        >
            <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-lg bg-admin-muted sm:mb-4 sm:rounded-xl">
                <ProductStatusLabels
                    isNew={Boolean(product.is_new)}
                    isHit={Boolean(product.is_hit)}
                    hasDiscount={Boolean(product.has_discount)}
                />

                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggleWishlist(product.id);
                    }}
                    aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                    className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 hover:scale-110 active:scale-95 ${inWishlist
                        ? "border-admin-primary/30 bg-admin-primary text-white shadow-sm"
                        : "border-admin-border bg-white/95 text-admin-text backdrop-blur hover:bg-admin-muted"
                        }`}
                >
                    <span aria-hidden className="text-[13px] leading-none">
                        {inWishlist ? "♥" : "♡"}
                    </span>
                </button>

                {imagePath ? (
                    <>
                        <Image
                            src={imagePath}
                            loader={productImageLoader}
                            alt={cardTitle}
                            fill
                            loading={eager ? "eager" : "lazy"}
                            sizes="(max-width: 640px) 50vw, 280px"
                            className={`object-contain transition-opacity duration-300 ${secondaryImagePath ? "group-hover:opacity-0" : ""}`}
                        />
                        {secondaryImagePath && (
                            <Image
                                src={secondaryImagePath}
                                loader={productImageLoader}
                                alt={`${cardTitle} — вид 2`}
                                fill
                                loading="lazy"
                                sizes="(max-width: 640px) 50vw, 280px"
                                className="pointer-events-none object-contain opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            />
                        )}
                    </>
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

            <div className="flex flex-1 flex-col">
                {showBrandLine ? (
                    <div className="mb-1 text-sm text-admin-text-secondary">{brandName}</div>
                ) : null}

                <div className="line-clamp-2 min-h-[44px] text-sm font-medium leading-5 text-admin-text sm:min-h-[48px] sm:text-base sm:leading-6">
                    {productTitle}
                </div>

                {showVariants &&
                    (visibleVariants.length > 0 || (!product.is_preorder_available && visibleVariants.length === 0)) && (
                        <div className="mt-2 flex min-h-[22px] flex-wrap items-center gap-1">
                            {visibleVariants.map((label, i) => (
                                <span
                                    key={`${label}-${i}`}
                                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-admin-border bg-admin-muted px-1.5 text-[10px] font-semibold text-admin-text"
                                >
                                    {label}
                                </span>
                            ))}
                            {hiddenVariantsCount > 0 && (
                                <span className="inline-flex h-5 items-center justify-center rounded-full border border-admin-border px-1.5 text-[10px] font-semibold text-admin-text-secondary">
                                    +{hiddenVariantsCount}
                                </span>
                            )}
                        </div>
                    )}

                <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="text-base font-semibold text-admin-text sm:text-lg">{formatPrice(product)}</div>
                            {oldPrice ? (
                                <div className="text-sm text-admin-text-secondary line-through">{oldPrice}</div>
                            ) : null}
                        </div>
                        {variant === "catalog" && isAuthenticated && loyaltyCard && loyaltyPriceText && (
                            <div className="mt-1 text-[10px] font-medium text-emerald-700">
                                По карте: {loyaltyPriceText}
                            </div>
                        )}
                    </div>

                    <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-admin-border bg-admin-muted text-admin-primary transition-all duration-150 group-hover:border-admin-primary group-hover:bg-admin-primary group-hover:text-white sm:h-9 sm:w-9"
                        title="Перейти к товару"
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
                    </span>
                </div>
            </div>
        </Link>
    );
}
