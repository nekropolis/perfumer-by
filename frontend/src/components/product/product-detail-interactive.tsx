"use client";

import { Heart } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import { addToCart } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import CopyText from "@/components/ui/copy-text";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductServiceInfo from "@/components/product/product-service-info";
import ProductReviewsTab from "@/components/product/product-reviews-tab";
import ProductDetailGallery from "@/components/product/product-detail-gallery";
import { productDisplayName } from "@/lib/product-display-name";
import {
    applyWaitingDiscount,
    isVariantEligibleForLoyaltyCardDiscount,
    isVariantEligibleForWaitingDiscount,
    resolveActiveLoyaltyCard,
    resolveDiscountedPrice,
    WAITING_DISCOUNT_PERCENT,
} from "@/lib/loyalty-pricing";
import {
    formatProductDetailPrice,
    formatVariantConcentrationLabel,
    formatVariantVolumeLine,
    getVariantAvailabilityState,
    normalizeProductVariants,
} from "@/lib/product-detail-utils";

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
    attributesContent: React.ReactNode;
    descriptionContent: React.ReactNode;
    deliveryDate?: string | null;
};

export default function ProductDetailInteractive({
    product,
    initialProductReviews,
    attributesContent,
    descriptionContent,
    deliveryDate,
}: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "reviews">("attributes");
    const reviewsTabCount = initialProductReviews?.length ?? 0;
    const { cart, setCartState } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();
    const searchParams = useSearchParams();
    const variants = useMemo(() => normalizeProductVariants(product.variants), [product.variants]);

    const initialVariantId = useMemo(() => {
        const variantFromQuery = Number(searchParams.get("variant") || 0);
        if (variantFromQuery > 0 && variants.some((variant) => variant.id === variantFromQuery)) {
            return variantFromQuery;
        }

        const defaultVariant =
            variants.find((variant) => variant.id === product.default_variant_id) || variants[0] || null;

        return defaultVariant?.id ?? null;
    }, [product.default_variant_id, searchParams, variants]);

    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(initialVariantId);
    const [waitingDiscountByVariant, setWaitingDiscountByVariant] = useState<Record<number, boolean>>({});

    const selectedVariant = useMemo<ProductVariantData | null>(() => {
        return variants.find((variant) => variant.id === selectedVariantId) || null;
    }, [variants, selectedVariantId]);

    const isSelectedVariantInCart = Boolean(
        selectedVariant?.id && cart?.items?.some((item) => item.product_variant_id === selectedVariant.id),
    );
    const selectedVariantHasPromotion = Boolean(selectedVariant?.is_promotion);
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const selectedVariantEligibleForLoyalty = isVariantEligibleForLoyaltyCardDiscount(
        selectedVariant?.is_promotion,
    );
    const selectedVariantEligibleForWaiting = Boolean(
        selectedVariant &&
            isVariantEligibleForWaitingDiscount(selectedVariant.is_promotion) &&
            selectedVariant.availability_source !== "unavailable",
    );
    const waitingDiscountForced = selectedVariant?.availability_source === "supplier_only";
    const waitingDiscountActive = waitingDiscountForced ||
        (selectedVariant ? (waitingDiscountByVariant[selectedVariant.id] ?? false) : false);

    const loyaltyPercent = isAuthenticated && selectedVariantEligibleForLoyalty
        ? (loyaltyCard?.discountPercent ?? 0)
        : 0;

    const displayPrice = waitingDiscountActive && selectedVariantEligibleForWaiting
        ? (selectedVariant?.waiting_price ?? applyWaitingDiscount(selectedVariant?.price ?? null))
        : selectedVariant?.price ?? null;

    const inWishlist = isInWishlist(product.id);

    const handleAddToCart = () => {
        if (!selectedVariant?.id) {
            return;
        }

        startTransition(async () => {
            try {
                const response = await addToCart(selectedVariant.id, 1, {
                    waiting_discount: waitingDiscountActive,
                });
                setCartState(response.data);
            } catch (error) {
                console.error(error);
            }
        });
    };

    return (
        <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-8 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                <ProductDetailGallery product={product} selectedVariantHasPromotion={selectedVariantHasPromotion} />

                <section className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex min-w-0 items-center gap-1 text-sm text-admin-text-secondary">
                            <span className="shrink-0">Код товара:</span>
                            <CopyText
                                value={String(product.id)}
                                label={`${product.id}`}
                                title="Скопировать код товара"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => void toggleWishlist(product.id)}
                            aria-pressed={inWishlist}
                            aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm transition hover:bg-admin-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary ${
                                inWishlist
                                    ? "font-medium text-admin-primary"
                                    : "text-admin-text-secondary hover:text-admin-text"
                            }`}
                        >
                            <Heart
                                className={`h-4 w-4 shrink-0 ${inWishlist ? "fill-current" : ""}`}
                                aria-hidden
                            />
                            <span className="sm:hidden">{inWishlist ? "В избр." : "Избранное"}</span>
                            <span className="hidden sm:inline">
                                {inWishlist ? "В избранном" : "В избранное"}
                            </span>
                        </button>
                    </div>

                    <h1 className="mb-5 text-3xl font-semibold leading-tight sm:text-4xl">
                        {product.h1 || productDisplayName(product)}
                    </h1>

                    {variants.length > 0 ? (
                        <>
                            <div className="mb-3 text-sm font-medium text-admin-text">Выбор вариантов</div>
                            <div className="mb-4 rounded-2xl border border-admin-border bg-admin-bg p-2 xl:mb-0">
                                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                                    {variants.map((variant) => {
                                        const isSelected = variant.id === selectedVariantId;
                                        const availability = getVariantAvailabilityState(
                                            variant,
                                            product.is_out_of_stock,
                                        );
                                        const gridWaitingActive = variant.availability_source === "supplier_only";
                                        const gridPrice = resolveDiscountedPrice(variant.price, {
                                            isPromotion: variant.is_promotion,
                                            loyaltyPercent:
                                                isAuthenticated && !variant.is_promotion
                                                    ? (loyaltyCard?.discountPercent ?? 0)
                                                    : 0,
                                            waitingActive: gridWaitingActive,
                                        });

                                        return (
                                            <button
                                                key={`variant-${variant.id}`}
                                                type="button"
                                                onClick={() => setSelectedVariantId(variant.id)}
                                                className={`group flex w-full cursor-pointer flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-150 ${
                                                    isSelected
                                                        ? "border-admin-primary bg-admin-surface shadow-[0_0_0_1px_rgba(36,28,21,0.12)]"
                                                        : "border-admin-border bg-admin-surface hover:border-admin-primary/40 hover:bg-admin-bg active:scale-[0.98]"
                                                }`}
                                            >
                                                <span className="flex min-w-0 items-center justify-between gap-1">
                                                    <span className="line-clamp-1 text-[13px] font-medium leading-4 text-admin-text">
                                                        {formatVariantVolumeLine(variant)}
                                                    </span>
                                                    {variant.is_promotion ? (
                                                        <span className="shrink-0 rounded-full bg-[#8E2C3B] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#F6E7D6]">
                                                            Акция
                                                        </span>
                                                    ) : null}
                                                </span>

                                                <span className="line-clamp-1 text-[11px] leading-4 text-admin-text-secondary">
                                                    {formatVariantConcentrationLabel(variant)}
                                                </span>

                                                <div className="flex items-baseline gap-1.5 pt-0.5">
                                                    {gridPrice ? (
                                                        <span className="text-[13px] font-semibold leading-4 text-admin-text">
                                                            {formatProductDetailPrice(gridPrice)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[13px] font-semibold leading-4 text-admin-text-secondary">
                                                            —
                                                        </span>
                                                    )}

                                                    <span className={`text-[11px] leading-4 ${availability.className}`}>
                                                        {availability.text}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                            <div className="mb-2 text-2xl font-semibold leading-tight text-amber-900">
                                Ожидается поступление
                            </div>
                            <p className="text-sm leading-6 text-amber-900/80">
                                Пока у нас нет точных данных о сроках поставки и актуальной цене на этот аромат.
                                Заполните форму «Сообщить о появлении» — мы с Вами свяжемся, как только товар появится
                                в наличии, и подскажем стоимость.
                            </p>
                        </div>
                    )}
                </section>

                <aside className="contents xl:block xl:col-span-1 xl:sticky xl:top-24 xl:self-start">
                    <ProductBuyBox
                        selectedVariant={selectedVariant}
                        isSelectedVariantInCart={isSelectedVariantInCart}
                        isPending={isPending}
                        onAddToCartAction={handleAddToCart}
                        formatPriceAction={formatProductDetailPrice}
                        productId={product.id}
                        productName={productDisplayName(product)}
                        isProductOutOfStock={product.is_out_of_stock}
                        displayPrice={displayPrice}
                        loyaltyCardNumber={
                            isAuthenticated && selectedVariantEligibleForLoyalty
                                ? (loyaltyCard?.number ?? null)
                                : null
                        }
                        loyaltyPercent={loyaltyPercent}
                        waitingDiscountActive={waitingDiscountActive}
                        waitingDiscountForced={waitingDiscountForced}
                        waitingDiscountPercent={WAITING_DISCOUNT_PERCENT}
                        onWaitingDiscountChangeAction={(active) => {
                            if (!selectedVariant || waitingDiscountForced) {
                                return;
                            }
                            setWaitingDiscountByVariant((prev) => ({
                                ...prev,
                                [selectedVariant.id]: active,
                            }));
                        }}
                        waitingDiscountApplicable={selectedVariantEligibleForWaiting}
                        deliveryDate={deliveryDate}
                    />
                </aside>

                <section className="md:col-span-2 xl:col-span-2">
                    <ProductServiceInfo
                        productId={product.id}
                        productName={productDisplayName(product)}
                        variantId={selectedVariant?.id ?? null}
                        variantTitle={selectedVariant?.display_name ?? null}
                    />
                </section>

                <section className="min-w-0 md:col-span-2 xl:col-span-2">
                    <div className="rounded-3xl border border-admin-border bg-admin-surface">
                        <div
                            className="flex overflow-x-auto border-b border-admin-border"
                            role="tablist"
                            aria-label="Информация о товаре"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "attributes"}
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 whitespace-nowrap px-6 py-4 text-sm font-medium ${
                                    activeTab === "attributes"
                                        ? "border-b-2 border-admin-primary text-admin-text"
                                        : "text-admin-text-secondary"
                                }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "reviews"}
                                onClick={() => setActiveTab("reviews")}
                                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-6 py-4 text-sm font-medium ${
                                    activeTab === "reviews"
                                        ? "border-b-2 border-admin-primary text-admin-text"
                                        : "text-admin-text-secondary"
                                }`}
                            >
                                <span>Отзывы</span>
                                <span
                                    className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[11px] font-semibold tabular-nums text-white"
                                    aria-label={`${reviewsTabCount} отзывов`}
                                >
                                    {reviewsTabCount}
                                </span>
                            </button>
                        </div>

                        <div className="p-5 sm:p-6">
                            <div
                                className={activeTab === "attributes" ? "block" : "hidden"}
                                role="tabpanel"
                                aria-hidden={activeTab !== "attributes"}
                            >
                                {attributesContent}
                            </div>

                            <div
                                className={activeTab === "reviews" ? "block" : "hidden"}
                                role="tabpanel"
                                aria-hidden={activeTab !== "reviews"}
                            >
                                <ProductReviewsTab
                                    productId={product.id}
                                    isActive={activeTab === "reviews"}
                                    initialReviews={initialProductReviews}
                                />
                            </div>

                            {descriptionContent}
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}
