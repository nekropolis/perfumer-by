"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import { addToCart, updateCartItem } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import CopyText from "@/components/ui/copy-text";
import { HEADER_STICKY_EXTENSION_ID } from "@/components/layout/header/constants";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductServiceInfo, {
    type ProductServiceDeliveryInfo,
} from "@/components/product/product-service-info";
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
    formatReviewsCountLabel,
    formatVariantConcentrationLabel,
    formatVariantVolumeLine,
    getProductAttributeDisplayValue,
    getVariantAvailabilityState,
    normalizeProductVariants,
} from "@/lib/product-detail-utils";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
    attributesContent: React.ReactNode;
    descriptionContent: React.ReactNode;
    deliveryDate?: string | null;
    deliveryInfo?: ProductServiceDeliveryInfo;
    variantFromQuery?: number;
};

export default function ProductDetailInteractive({
    product,
    initialProductReviews,
    attributesContent,
    descriptionContent,
    deliveryDate,
    deliveryInfo,
    variantFromQuery = 0,
}: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "reviews">("attributes");
    const reviewsTabCount = initialProductReviews?.length ?? 0;
    const { cart, setCartState } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();
    const variants = useMemo(() => normalizeProductVariants(product.variants), [product.variants]);

    const initialVariantId = useMemo(() => {
        if (variantFromQuery > 0 && variants.some((variant) => variant.id === variantFromQuery)) {
            return variantFromQuery;
        }

        const defaultVariant =
            variants.find((variant) => variant.id === product.default_variant_id) || variants[0] || null;

        return defaultVariant?.id ?? null;
    }, [product.default_variant_id, variantFromQuery, variants]);

    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(initialVariantId);
    const [waitingDiscountByVariant, setWaitingDiscountByVariant] = useState<Record<number, boolean>>({});
    const [isTitlePinned, setIsTitlePinned] = useState(false);
    const [titleBarEntered, setTitleBarEntered] = useState(false);
    const titleRef = useRef<HTMLHeadingElement | null>(null);
    const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

    const selectedVariant = useMemo<ProductVariantData | null>(() => {
        return variants.find((variant) => variant.id === selectedVariantId) || null;
    }, [variants, selectedVariantId]);

    const cartItemForSelected = useMemo(() => {
        if (!selectedVariant?.id || !cart?.items) {
            return null;
        }
        return cart.items.find((item) => item.product_variant_id === selectedVariant.id) ?? null;
    }, [cart, selectedVariant]);

    const isSelectedVariantInCart = Boolean(cartItemForSelected);
    const selectedVariantHasPromotion = Boolean(selectedVariant?.is_promotion);
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const selectedVariantEligibleForLoyalty = isVariantEligibleForLoyaltyCardDiscount(
        selectedVariant?.is_promotion,
    );
    const selectedVariantEligibleForWaiting = Boolean(
        selectedVariant &&
            isVariantEligibleForWaitingDiscount(
                selectedVariant.is_promotion,
                selectedVariant.availability_source,
            ),
    );
    const waitingDiscountForced = selectedVariant?.availability_source === "supplier_only";
    const waitingDiscountActive =
        waitingDiscountForced ||
        (selectedVariant
            ? (waitingDiscountByVariant[selectedVariant.id] ??
                  cartItemForSelected?.waiting_discount ??
                  false)
            : false);

    const loyaltyPercent = isAuthenticated && selectedVariantEligibleForLoyalty
        ? (loyaltyCard?.discountPercent ?? 0)
        : 0;

    const displayPrice = waitingDiscountActive && selectedVariantEligibleForWaiting
        ? (selectedVariant?.waiting_price ?? applyWaitingDiscount(selectedVariant?.price ?? null))
        : selectedVariant?.price ?? null;

    const inWishlist = isInWishlist(product.id);
    const genderLabel = getProductAttributeDisplayValue(product.attribute_values, "Для кого");
    const seasonLabel = getProductAttributeDisplayValue(product.attribute_values, "Сезон");
    const reviewsMetaLabel = formatReviewsCountLabel(reviewsTabCount);

    const productTitle = product.h1 || productDisplayName(product);

    useEffect(() => {
        const titleEl = titleRef.current;
        if (!titleEl || typeof window === "undefined") {
            return;
        }

        let observer: IntersectionObserver | null = null;

        const readStickyTop = () => {
            const stickyTopRaw = getComputedStyle(document.documentElement)
                .getPropertyValue("--catalog-toolbar-sticky-top")
                .trim();
            return Number.parseFloat(stickyTopRaw) || 130;
        };

        const updatePinned = () => {
            if (window.matchMedia("(min-width: 1280px)").matches) {
                setIsTitlePinned(false);
                return;
            }

            // Only pin after the in-flow title has scrolled up past the header.
            // (Title still below the fold must not show the bar.)
            setIsTitlePinned(titleEl.getBoundingClientRect().bottom <= readStickyTop());
        };

        const disconnect = () => {
            observer?.disconnect();
            observer = null;
        };

        const setup = () => {
            disconnect();
            updatePinned();

            if (window.matchMedia("(min-width: 1280px)").matches) {
                return;
            }

            const stickyTop = readStickyTop();
            observer = new IntersectionObserver(
                () => {
                    updatePinned();
                },
                {
                    root: null,
                    rootMargin: `-${stickyTop}px 0px 0px 0px`,
                    threshold: [0, 1],
                },
            );
            observer.observe(titleEl);
        };

        setup();
        window.addEventListener("scroll", updatePinned, { passive: true });
        window.addEventListener("resize", setup);

        return () => {
            window.removeEventListener("scroll", updatePinned);
            window.removeEventListener("resize", setup);
            disconnect();
        };
    }, []);

    useEffect(() => {
        if (!isTitlePinned) {
            setTitleBarEntered(false);
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            setTitleBarEntered(true);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isTitlePinned]);

    const openReviewsTab = () => {
        setActiveTab("reviews");
        requestAnimationFrame(() => {
            document.getElementById("product-info-tabs")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });
    };

    const handleWaitingDiscountChange = (active: boolean) => {
        if (!selectedVariant || waitingDiscountForced) {
            return;
        }

        setWaitingDiscountByVariant((prev) => ({
            ...prev,
            [selectedVariant.id]: active,
        }));

        if (!cartItemForSelected) {
            return;
        }

        startTransition(async () => {
            try {
                const response = await updateCartItem(cartItemForSelected.id, cartItemForSelected.qty, {
                    waiting_discount: active,
                });
                setCartState(response.data);
            } catch (error) {
                console.error(error);
                setWaitingDiscountByVariant((prev) => ({
                    ...prev,
                    [selectedVariant.id]: !active,
                }));
            }
        });
    };

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

    const headerTitleSlot =
        isClient && typeof document !== "undefined"
            ? document.getElementById(HEADER_STICKY_EXTENSION_ID)
            : null;

    return (
        <>
            {isTitlePinned && headerTitleSlot
                ? createPortal(
                      <div
                          className={[
                              "border-t border-admin-border bg-admin-surface px-4 py-3 transition-[opacity,transform] duration-300 ease-out xl:hidden",
                              titleBarEntered
                                  ? "translate-y-0 opacity-100"
                                  : "-translate-y-2 opacity-0",
                          ].join(" ")}
                          aria-hidden
                      >
                          <div className="mx-auto max-w-7xl truncate font-display text-xl font-semibold leading-snug text-admin-text sm:px-2 sm:text-2xl">
                              {productTitle}
                          </div>
                      </div>,
                      headerTitleSlot,
                  )
                : null}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-8 xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:items-stretch xl:[grid-template-areas:'gallery_variants_buybox'_'service_service_buybox'_'tabs_tabs_buybox']">
                <div className="xl:[grid-area:gallery]">
                    <ProductDetailGallery product={product} selectedVariantHasPromotion={selectedVariantHasPromotion} />
                </div>

                <section className="min-w-0 xl:[grid-area:variants]">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        {product.brand ? (
                            <Link
                                href={`/brands/${product.brand.slug}`}
                                className="min-w-0 truncate text-sm font-medium uppercase tracking-[0.08em] text-admin-text-secondary transition hover:text-admin-text"
                            >
                                {product.brand.name}
                            </Link>
                        ) : (
                            <span />
                        )}

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

                    <h1
                        ref={titleRef}
                        className="mb-2.5 font-display text-3xl font-semibold leading-tight sm:text-4xl"
                    >
                        {productTitle}
                    </h1>

                    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                        {genderLabel ? (
                            <span className="font-semibold uppercase tracking-wide text-admin-text">
                                {genderLabel}
                            </span>
                        ) : null}
                        {seasonLabel ? (
                            <span className="text-admin-text">{seasonLabel}</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-admin-text-secondary">
                            <span>Код:</span>
                            <CopyText
                                value={String(product.id)}
                                label={`${product.id}`}
                                title="Скопировать код товара"
                                className="px-0.5 font-medium text-admin-text underline decoration-admin-text/35 underline-offset-2"
                                iconSize={12}
                            />
                        </span>
                        <button
                            type="button"
                            onClick={openReviewsTab}
                            className="text-admin-text-secondary transition hover:text-admin-text"
                        >
                            {reviewsMetaLabel}
                        </button>
                    </div>

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
                                            oldPrice: variant.old_price,
                                        });

                                        return (
                                            <button
                                                key={`variant-${variant.id}`}
                                                type="button"
                                                onClick={() => setSelectedVariantId(variant.id)}
                                                className={`group flex w-full cursor-pointer flex-col gap-0.5 rounded-2xl border px-2.5 py-2 text-left transition-all duration-150 ${
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
                                                        <span className="text-[15px] font-semibold leading-5 text-admin-text">
                                                            {formatProductDetailPrice(gridPrice)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[15px] font-semibold leading-5 text-admin-text-secondary">
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

                <aside className="hidden xl:block xl:self-stretch xl:[grid-area:buybox]">
                    <div className="xl:sticky xl:top-[calc(var(--catalog-toolbar-sticky-top)+5px)] xl:z-10">
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
                            onWaitingDiscountChangeAction={handleWaitingDiscountChange}
                            waitingDiscountApplicable={selectedVariantEligibleForWaiting}
                            deliveryDate={deliveryDate}
                            surface="desktop"
                        />
                    </div>
                </aside>

                <section className="md:col-span-2 xl:[grid-area:service]">
                    <ProductServiceInfo delivery={deliveryInfo} />
                </section>

                <section id="product-info-tabs" className="min-w-0 md:col-span-2 xl:[grid-area:tabs]">
                    <div>
                        <div
                            className="flex items-center gap-2 overflow-x-auto border-b border-admin-border pb-3"
                            role="tablist"
                            aria-label="Информация о товаре"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "attributes"}
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                                    activeTab === "attributes"
                                        ? "bg-admin-primary text-white"
                                        : "text-admin-text-secondary hover:text-admin-text"
                                }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "reviews"}
                                onClick={() => setActiveTab("reviews")}
                                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                                    activeTab === "reviews"
                                        ? "bg-admin-primary text-white"
                                        : "text-admin-text-secondary hover:text-admin-text"
                                }`}
                                aria-label={`Отзывы, ${reviewsTabCount}`}
                            >
                                Отзывы · {reviewsTabCount}
                            </button>
                        </div>

                        <div className="pt-1 sm:pt-2">
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
                onWaitingDiscountChangeAction={handleWaitingDiscountChange}
                waitingDiscountApplicable={selectedVariantEligibleForWaiting}
                deliveryDate={deliveryDate}
                surface="mobile"
            />
        </>
    );
}
