import Link from "next/link";
import type { ReactNode } from "react";
import ProductCardImage from "@/components/product/product-card-image";
import ProductStatusLabels from "@/components/product/product-status-labels";
import type { ProductListItem } from "@/types/catalog";
import {
    compactVariantLabel,
    formatProductCardOldPrice,
    formatProductCardPrice,
    formatVariantChipLabel,
    getProductCardTitleParts,
    sortVariantLabelsByVolume,
    normalizeVariantLabels,
} from "@/lib/product-card-utils";
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    product: ProductListItem;
    eager?: boolean;
    variant?: "catalog" | "featured";
    wishlistSlot: ReactNode;
    loyaltySlot: ReactNode | null;
};

export default function ProductCardBody({
    product,
    eager = false,
    variant = "catalog",
    wishlistSlot,
    loyaltySlot,
}: Props) {
    const isCatalog = variant === "catalog";
    const rawVariants = sortVariantLabelsByVolume(normalizeVariantLabels(product.variant_labels));
    const compactVariants = rawVariants.map(compactVariantLabel);
    const visibleVariants = compactVariants.slice(0, isCatalog ? 4 : 3);
    const hiddenVariantsCount = Math.max(compactVariants.length - visibleVariants.length, 0);

    const imagePath = product.image ? String(product.image) : null;

    const catalogSwapPaths = Array.isArray(product.catalog_images)
        ? product.catalog_images.filter((p): p is string => typeof p === "string" && p.trim() !== "")
        : [];
    const secondaryImagePath =
        catalogSwapPaths.length >= 2 ? catalogSwapPaths[1] : null;

    const { cardTitle, brandName, showBrandLine, productTitle } = getProductCardTitleParts(product);
    const oldPrice = formatProductCardOldPrice(product);
    const productHref = product.listing_variant_id
        ? `/${product.slug}?variant=${product.listing_variant_id}`
        : `/${product.slug}`;

    const showOutOfStock = Boolean(product.is_out_of_stock) && !product.is_preorder_available;
    const hasNumericPrice = Boolean(product.price_range?.min || product.price_range?.max);
    const isAwaitingStock = showOutOfStock && !hasNumericPrice;
    const showCardArrow = !isCatalog || hasNumericPrice;
    const showVariants =
        isCatalog &&
        !isAwaitingStock &&
        (visibleVariants.length > 0 || (!product.is_preorder_available && visibleVariants.length === 0));

    return (
        <Link
            href={productHref}
            className={`${siteCard} group relative flex h-full min-w-0 flex-col transition duration-200 ease-out active:scale-[0.99] ${
                isCatalog
                    ? "origin-center p-2 hover:z-10 hover:scale-[1.03] hover:border-admin-border-strong hover:shadow-md sm:p-3 lg:p-4"
                    : "p-3 hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md sm:p-4"
            }`}
        >
            <div
                className={`relative w-full overflow-hidden bg-white ${
                    isCatalog
                        ? "mb-2 aspect-[5/6] rounded-lg sm:mb-2.5 sm:aspect-[4/5] lg:mb-3 lg:aspect-square lg:rounded-xl"
                        : "mb-3 aspect-square rounded-lg sm:mb-4 sm:rounded-xl"
                }`}
            >
                <ProductStatusLabels
                    isNew={Boolean(product.is_new)}
                    isHit={Boolean(product.is_hit)}
                    hasPromotion={Boolean(product.has_promotion)}
                    isOutOfStock={showOutOfStock}
                    className={
                        isCatalog
                            ? "left-1.5 top-1.5 gap-0.5 [&_span]:px-1.5 [&_span]:py-0.5 [&_span]:text-[9px] sm:left-2 sm:top-2 sm:[&_span]:text-[10px] [&_svg]:h-2 [&_svg]:w-2 sm:[&_svg]:h-2.5 sm:[&_svg]:w-2.5"
                            : ""
                    }
                />

                <div
                    className={
                        isCatalog
                            ? "absolute right-0 top-0 z-10 origin-top-right scale-[0.88] sm:right-0.5 sm:top-0.5 sm:scale-100 [&_button]:static"
                            : undefined
                    }
                >
                    {wishlistSlot}
                </div>

                <ProductCardImage
                    imagePath={imagePath}
                    secondaryImagePath={secondaryImagePath}
                    alt={cardTitle}
                    eager={eager}
                />
            </div>

            <div className={`flex min-w-0 flex-1 flex-col ${isCatalog ? "gap-1" : ""}`}>
                {showBrandLine ? (
                    <div
                        className={
                            isCatalog
                                ? "min-h-[14px] truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-admin-text-secondary sm:min-h-[15px] sm:text-[11px]"
                                : "mb-1 text-sm text-admin-text-secondary"
                        }
                    >
                        {brandName}
                    </div>
                ) : isCatalog ? (
                    <div aria-hidden className="min-h-[14px] sm:min-h-[15px]" />
                ) : null}

                <div
                    className={
                        isCatalog
                            ? "line-clamp-2 min-h-[33px] text-[13px] font-semibold leading-[1.25] text-admin-text sm:min-h-[38px] sm:text-sm sm:leading-snug"
                            : "line-clamp-2 min-h-[44px] text-sm font-medium leading-5 text-admin-text sm:min-h-[48px] sm:text-base sm:leading-6"
                    }
                >
                    {productTitle}
                </div>

                {showVariants ? (
                    <div className="flex min-h-[18px] flex-wrap items-center gap-0.5 sm:min-h-5">
                        {visibleVariants.map((label, i) => (
                            <span
                                key={`${label}-${i}`}
                                className="inline-flex h-[18px] items-center justify-center rounded border border-admin-border bg-admin-muted px-1 text-[9px] font-semibold tabular-nums text-admin-text sm:h-5 sm:px-1.5 sm:text-[10px]"
                            >
                                {formatVariantChipLabel(label)}
                            </span>
                        ))}
                        {hiddenVariantsCount > 0 ? (
                            <span className="inline-flex h-[18px] items-center justify-center rounded border border-dashed border-admin-border px-1 text-[9px] font-semibold text-admin-text-secondary sm:h-5 sm:px-1.5 sm:text-[10px]">
                                +{hiddenVariantsCount}
                            </span>
                        ) : null}
                    </div>
                ) : isCatalog ? (
                    <div aria-hidden className="min-h-[18px] sm:min-h-5" />
                ) : null}

                <div
                    className={
                        isCatalog
                            ? "mt-auto flex items-end justify-between gap-1 pt-1.5 sm:pt-2"
                            : "mt-auto flex items-end justify-between gap-2 pt-4"
                    }
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                            <div
                                className={
                                    isCatalog
                                        ? isAwaitingStock
                                            ? "max-w-full text-[11px] font-medium leading-snug text-admin-text-secondary sm:text-xs"
                                            : "whitespace-nowrap text-[12px] font-bold leading-tight tracking-tight text-admin-text tabular-nums sm:text-[13px] lg:text-sm"
                                        : "text-base font-semibold text-admin-text sm:text-lg"
                                }
                            >
                                {formatProductCardPrice(product)}
                            </div>
                            {oldPrice ? (
                                <div
                                    className={
                                        isCatalog
                                            ? "whitespace-nowrap text-[10px] text-admin-text-secondary line-through sm:text-[11px]"
                                            : "text-sm text-admin-text-secondary line-through"
                                    }
                                >
                                    {oldPrice}
                                </div>
                            ) : null}
                        </div>
                        {loyaltySlot}
                    </div>

                    {showCardArrow ? (
                        <span
                            aria-hidden
                            className={`flex shrink-0 items-center justify-center rounded-full border border-admin-border bg-admin-muted text-admin-primary transition-all duration-150 group-hover:border-admin-primary group-hover:bg-admin-primary group-hover:text-white ${
                                isCatalog
                                    ? "hidden h-7 w-7 lg:flex"
                                    : "h-8 w-8 sm:h-9 sm:w-9"
                            }`}
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
                    ) : null}
                </div>
            </div>
        </Link>
    );
}
