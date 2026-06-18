"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { applyPercentDiscount, resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";
import {
    formatProductDetailPrice,
    normalizeProductVariants,
} from "@/lib/product-detail-utils";

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
    attributesContent: React.ReactNode;
    descriptionContent: React.ReactNode;
};

export default function ProductDetailInteractive({
    product,
    initialProductReviews,
    attributesContent,
    descriptionContent,
}: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "reviews">("attributes");
    const reviewsTabCount = initialProductReviews?.length ?? 0;
    const { cart, setCartState } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();
    const variants = useMemo(() => normalizeProductVariants(product.variants), [product.variants]);

    const defaultVariant =
        variants.find((variant) => variant.id === product.default_variant_id) || variants[0] || null;

    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(defaultVariant?.id ?? null);

    const selectedVariant = useMemo<ProductVariantData | null>(() => {
        return variants.find((variant) => variant.id === selectedVariantId) || null;
    }, [variants, selectedVariantId]);
    const isSelectedVariantInCart = Boolean(
        selectedVariant?.id && cart?.items?.some((item) => item.product_variant_id === selectedVariant.id),
    );
    const selectedVariantHasDiscount = Boolean(
        selectedVariant &&
            selectedVariant.old_price &&
            selectedVariant.price &&
            Number(selectedVariant.old_price) > Number(selectedVariant.price),
    );
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const loyaltyPrice = applyPercentDiscount(
        selectedVariant?.price ?? null,
        loyaltyCard?.discountPercent ?? 0,
    );

    const [showMobileBuyBar, setShowMobileBuyBar] = useState(false);
    const [mobileBarBottomOffset, setMobileBarBottomOffset] = useState(0);
    const buyBoxAsideRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const updateViewportOffsets = () => {
            const vv = window.visualViewport;
            if (!vv) {
                setMobileBarBottomOffset(0);
                return;
            }
            const bottomOffset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
            setMobileBarBottomOffset(bottomOffset);
        };

        const updateVisibility = () => {
            const aside = buyBoxAsideRef.current;
            if (!aside) {
                setShowMobileBuyBar(false);
                return;
            }

            const isMobileViewport = window.matchMedia("(max-width: 1279px)").matches;
            if (!isMobileViewport) {
                setShowMobileBuyBar(false);
                return;
            }

            const rect = aside.getBoundingClientRect();
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const isBuyBoxVisible = rect.bottom > 0 && rect.top < viewportHeight;
            const hasReachedBuyBoxArea = rect.top < viewportHeight;
            const isBuyBoxAboveViewport = rect.bottom <= 0;

            setShowMobileBuyBar(hasReachedBuyBoxArea && isBuyBoxAboveViewport && !isBuyBoxVisible);
        };

        updateViewportOffsets();
        updateVisibility();
        window.addEventListener("scroll", updateVisibility, { passive: true });
        window.addEventListener("resize", updateVisibility);
        window.visualViewport?.addEventListener("resize", updateViewportOffsets);
        window.visualViewport?.addEventListener("scroll", updateViewportOffsets);

        return () => {
            window.removeEventListener("scroll", updateVisibility);
            window.removeEventListener("resize", updateVisibility);
            window.visualViewport?.removeEventListener("resize", updateViewportOffsets);
            window.visualViewport?.removeEventListener("scroll", updateViewportOffsets);
        };
    }, []);

    const handleAddToCart = () => {
        if (!selectedVariant?.id) {
            return;
        }

        startTransition(async () => {
            try {
                const response = await addToCart(selectedVariant.id, 1);
                setCartState(response.data);
            } catch (error) {
                console.error(error);
            }
        });
    };

    return (
        <>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[320px_minmax(0,1fr)] md:items-start xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                <ProductDetailGallery product={product} selectedVariantHasDiscount={selectedVariantHasDiscount} />

                <section className="min-w-0">
                    <div className="mb-2 flex items-center gap-1 text-sm text-admin-text-secondary">
                        <span>Код товара:</span>
                        <CopyText
                            value={String(product.id)}
                            label={`${product.id}`}
                            title="Скопировать код товара"
                        />
                    </div>

                    <h1 className="mb-5 text-3xl font-semibold leading-tight sm:text-4xl">
                        {product.h1 || productDisplayName(product)}
                    </h1>

                    <button
                        type="button"
                        onClick={() => void toggleWishlist(product.id)}
                        className={`mb-5 inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition ${
                            isInWishlist(product.id)
                                ? "border-admin-primary bg-admin-primary text-white hover:bg-admin-primary-hover"
                                : "border-admin-border bg-admin-surface text-admin-text hover:bg-admin-muted"
                        }`}
                    >
                        <span aria-hidden>{isInWishlist(product.id) ? "♥" : "♡"}</span>
                        <span>{isInWishlist(product.id) ? "В избранном" : "В избранное"}</span>
                    </button>

                    {variants.length > 0 ? (
                        <>
                            <div className="mb-3 text-sm font-medium text-admin-text">Выбор вариантов</div>
                            <div className="mb-6 rounded-3xl border border-admin-border bg-admin-bg p-3">
                                <div className="flex flex-wrap gap-2">
                                    {variants.map((variant) => {
                                        const isSelected = variant.id === selectedVariantId;

                                        let availabilityText = "Нет";
                                        let availabilityClass = "text-red-600";

                                        if (variant.is_available) {
                                            if (variant.is_preorder) {
                                                availabilityText = "Предзаказ";
                                                availabilityClass = "text-amber-600";
                                            } else if (product.is_out_of_stock) {
                                                availabilityText = "Под заказ";
                                                availabilityClass = "text-sky-700";
                                            } else {
                                                availabilityText = "В наличии";
                                                availabilityClass = "text-emerald-600";
                                            }
                                        }

                                        return (
                                            <button
                                                key={`variant-${variant.id}`}
                                                type="button"
                                                onClick={() => setSelectedVariantId(variant.id)}
                                                className={`group cursor-pointer rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 ${
                                                    isSelected
                                                        ? "bg-admin-surface border-admin-primary shadow-[0_0_0_2px_rgba(36,28,21,0.12)]"
                                                        : "bg-admin-surface border-admin-border hover:bg-admin-bg hover:border-admin-primary/40 hover:-translate-y-[1px] active:scale-[0.97]"
                                                }`}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-medium leading-5">
                                                        {variant.display_name}
                                                    </span>

                                                    <div className="flex items-center gap-2">
                                                        {variant.price ? (
                                                            <span className="text-xs text-admin-text-secondary group-hover:text-admin-text">
                                                                {formatProductDetailPrice(
                                                                    isAuthenticated && loyaltyCard
                                                                        ? applyPercentDiscount(
                                                                              variant.price,
                                                                              loyaltyCard.discountPercent,
                                                                          )
                                                                        : variant.price,
                                                                )}
                                                            </span>
                                                        ) : null}

                                                        <span className={`text-xs ${availabilityClass}`}>
                                                            {availabilityText}
                                                        </span>
                                                    </div>
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

                <aside ref={buyBoxAsideRef} className="self-start md:col-span-2 xl:col-span-1 xl:sticky xl:top-24">
                    <ProductBuyBox
                        selectedVariant={selectedVariant}
                        isSelectedVariantInCart={isSelectedVariantInCart}
                        isPending={isPending}
                        onAddToCartAction={handleAddToCart}
                        formatPriceAction={formatProductDetailPrice}
                        productId={product.id}
                        productName={productDisplayName(product)}
                        isProductOutOfStock={product.is_out_of_stock}
                        loyaltyCardNumber={isAuthenticated ? (loyaltyCard?.number ?? null) : null}
                        loyaltyPercent={isAuthenticated ? (loyaltyCard?.discountPercent ?? 0) : 0}
                        loyaltyPrice={isAuthenticated ? loyaltyPrice : null}
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

            {showMobileBuyBar ? (
                <div
                    className="fixed inset-x-0 bottom-0 z-[130] border-t border-admin-border bg-admin-surface/95 px-3 pt-3 backdrop-blur xl:hidden"
                    style={{
                        bottom: `${mobileBarBottomOffset}px`,
                        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                    }}
                >
                    <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-admin-text">
                                {product.h1 || productDisplayName(product)}
                            </div>
                            <div className="truncate text-xs text-admin-text-secondary">
                                {selectedVariant?.display_name || "Вариант не выбран"}
                            </div>
                            <div className="text-base font-semibold text-admin-text">
                                {selectedVariant
                                    ? formatProductDetailPrice(
                                          isAuthenticated && loyaltyPrice ? loyaltyPrice : selectedVariant.price,
                                      )
                                    : "Цена уточняется"}
                            </div>
                        </div>
                        {isSelectedVariantInCart ? (
                            <Link
                                href="/cart"
                                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-admin-muted px-4 text-sm font-medium text-admin-primary"
                            >
                                В корзине (оформить)
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={handleAddToCart}
                                disabled={!selectedVariant?.is_available || isPending}
                                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isPending ? "Добавление..." : "В корзину"}
                            </button>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}
