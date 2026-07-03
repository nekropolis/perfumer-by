import Link from "next/link";
import type { ReactNode } from "react";
import ProductCardImage from "@/components/product/product-card-image";
import ProductStatusLabels from "@/components/product/product-status-labels";
import type { ProductListItem } from "@/types/catalog";
import {
    compactVariantLabel,
    formatProductCardOldPrice,
    formatProductCardPrice,
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
    const showVariants = variant === "catalog";
    const rawVariants = sortVariantLabelsByVolume(normalizeVariantLabels(product.variant_labels));
    const compactVariants = rawVariants.map(compactVariantLabel);
    const visibleVariants = compactVariants.slice(0, 3);
    const hiddenVariantsCount = Math.max(compactVariants.length - 3, 0);

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

    return (
        <Link
            href={productHref}
            className={`${siteCard} group relative flex h-full min-w-0 flex-col p-3 transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md active:scale-[0.99] sm:p-4`}
        >
            <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-lg bg-admin-muted sm:mb-4 sm:rounded-xl">
                <ProductStatusLabels
                    isNew={Boolean(product.is_new)}
                    isHit={Boolean(product.is_hit)}
                    hasPromotion={Boolean(product.has_promotion)}
                />

                {wishlistSlot}

                <ProductCardImage
                    imagePath={imagePath}
                    secondaryImagePath={secondaryImagePath}
                    alt={cardTitle}
                    eager={eager}
                />

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
                            <div className="text-base font-semibold text-admin-text sm:text-lg">
                                {formatProductCardPrice(product)}
                            </div>
                            {oldPrice ? (
                                <div className="text-sm text-admin-text-secondary line-through">{oldPrice}</div>
                            ) : null}
                        </div>
                        {loyaltySlot}
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
