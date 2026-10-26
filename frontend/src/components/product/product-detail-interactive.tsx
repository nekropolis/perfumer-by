"use client";

import { ChevronLeft, Heart, Share2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import { addToCart, updateCartItem } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import CopyText from "@/components/ui/copy-text";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductDiscontinuedReplacement from "@/components/product/product-discontinued-replacement";
import ProductServiceInfo, {
    type ProductServiceDeliveryInfo,
} from "@/components/product/product-service-info";
import ProductReviewsTab from "@/components/product/product-reviews-tab";
import ProductDetailGallery from "@/components/product/product-detail-gallery";
import { productDisplayName } from "@/lib/product-display-name";
import {
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
    formatVariantDesignLabel,
    formatVariantVolumeLine,
    getProductAttributeDisplayValue,
    getVariantAvailabilityState,
    normalizeProductVariants,
} from "@/lib/product-detail-utils";

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
    /** Всего опубликованных отзывов (список ограничен 50). */
    initialProductReviewsTotal?: number;
    attributesContent: React.ReactNode;
    descriptionContent: React.ReactNode;
    deliveryDate?: string | null;
    deliveryInfo?: ProductServiceDeliveryInfo;
    variantFromQuery?: number;
};

export default function ProductDetailInteractive({
    product,
    initialProductReviews,
    initialProductReviewsTotal,
    attributesContent,
    descriptionContent,
    deliveryDate,
    deliveryInfo,
    variantFromQuery = 0,
}: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "reviews">("attributes");
    const reviewsTabCount = initialProductReviewsTotal ?? initialProductReviews?.length ?? 0;
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
    const [shareCopied, setShareCopied] = useState(false);

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
            selectedVariant.waiting_discount_percent,
        ),
    );
    const waitingDiscountForced = selectedVariant?.availability_source === "supplier_only";
    const waitingDiscountActive =
        selectedVariantEligibleForWaiting &&
        (waitingDiscountForced ||
            (selectedVariant
                ? (waitingDiscountByVariant[selectedVariant.id] ??
                    cartItemForSelected?.waiting_discount ??
                    false)
                : false));

    const loyaltyPercent = isAuthenticated && selectedVariantEligibleForLoyalty
        ? (loyaltyCard?.discountPercent ?? 0)
        : 0;

    const variantWaitingActive = (variant: ProductVariantData) => {
        if (!isVariantEligibleForWaitingDiscount(
            variant.is_promotion,
            variant.availability_source,
            variant.waiting_discount_percent,
        )) {
            return false;
        }
        if (variant.availability_source === "supplier_only") {
            return true;
        }
        if (variant.id === selectedVariantId) {
            return waitingDiscountActive;
        }
        if (waitingDiscountByVariant[variant.id] !== undefined) {
            return waitingDiscountByVariant[variant.id];
        }
        return cart?.items.some(
            (item) => item.product_variant_id === variant.id && item.waiting_discount,
        ) ?? false;
    };

    const variantCustomerPrice = (variant: ProductVariantData) =>
        resolveDiscountedPrice(variant.price, {
            isPromotion: variant.is_promotion,
            loyaltyPercent:
                isAuthenticated && !variant.is_promotion ? (loyaltyCard?.discountPercent ?? 0) : 0,
            waitingActive: variantWaitingActive(variant),
            oldPrice: variant.old_price,
        });

    const displayPrice = selectedVariant ? variantCustomerPrice(selectedVariant) : null;

    const inWishlist = isInWishlist(product.id);
    const genderLabel = getProductAttributeDisplayValue(product.attribute_values, "Для кого");
    const seasonLabel = getProductAttributeDisplayValue(product.attribute_values, "Сезон");
    const reviewsMetaLabel = formatReviewsCountLabel(reviewsTabCount);

    const productTitle = product.h1 || productDisplayName(product);

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

    const shareProduct = () => {
        const url = window.location.href;
        const payload = { title: productTitle, url };
        if (typeof navigator.share === "function") {
            void navigator.share(payload).catch(() => undefined);
            return;
        }
        void navigator.clipboard?.writeText(url).then(() => {
            setShareCopied(true);
            window.setTimeout(() => setShareCopied(false), 1600);
        });
    };

    const stickyHeaderActions = (
        <>
            <button
                type="button"
                onClick={() => void toggleWishlist(product.id)}
                aria-pressed={inWishlist}
                aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${inWishlist ? "text-admin-primary" : "text-admin-text-secondary"
                    }`}
            >
                <Heart className={`h-[18px] w-[18px] ${inWishlist ? "fill-current" : ""}`} aria-hidden />
            </button>
            <button
                type="button"
                onClick={shareProduct}
                aria-label={shareCopied ? "Ссылка скопирована" : "Поделиться"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-admin-text-secondary"
            >
                <Share2 className="h-[18px] w-[18px]" aria-hidden />
            </button>
        </>
    );

    return (
        <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-8 xl:grid-cols-[310px_minmax(0,1fr)_320px] xl:items-stretch xl:gap-5 xl:[grid-template-areas:'gallery_variants_buybox'_'service_service_buybox'_'tabs_tabs_buybox']">
                <div className="order-2 md:order-none xl:[grid-area:gallery]">
                    <ProductDetailGallery product={product} selectedVariantHasPromotion={selectedVariantHasPromotion} />
                </div>

                <section className="contents min-w-0 md:block xl:[grid-area:variants]">
                    <div className="order-1 md:order-none">
                        <div className="flex items-start gap-0.5 md:mb-2 md:block">
                            <Link
                                href="/catalog"
                                aria-label="В каталог"
                                className="mt-px inline-flex shrink-0 text-admin-text-secondary md:hidden"
                            >
                                <ChevronLeft className="h-4 w-4" aria-hidden />
                            </Link>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <h1 className="order-1 font-display text-base font-semibold leading-tight md:order-2 md:mb-2 md:text-4xl">
                                    {productTitle}
                                </h1>
                                <div className="order-2 hidden flex-wrap items-center justify-between gap-x-3 gap-y-1 md:order-1 md:mb-2 md:flex">
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

                                    <div className="hidden shrink-0 items-center gap-1 md:flex">
                                        <button
                                            type="button"
                                            onClick={() => void toggleWishlist(product.id)}
                                            aria-pressed={inWishlist}
                                            aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-admin-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary ${inWishlist
                                                ? "text-admin-primary"
                                                : "text-admin-text-secondary hover:text-admin-text"
                                                }`}
                                        >
                                            <Heart
                                                className={`h-5 w-5 shrink-0 ${inWishlist ? "fill-current" : ""}`}
                                                aria-hidden
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={shareProduct}
                                            aria-label={shareCopied ? "Ссылка скопирована" : "Поделиться"}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary"
                                        >
                                            <Share2 className="h-5 w-5 shrink-0" aria-hidden />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="order-3 md:order-none">
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
                            replacement={product.replacement ?? null}
                            surface="mobile"
                            headerActions={stickyHeaderActions}
                        />
                    </div>

                    <div className="order-4 mb-4 flex flex-col gap-1.5 text-sm md:order-none">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 md:hidden">
                            <button
                                type="button"
                                onClick={() => void toggleWishlist(product.id)}
                                aria-pressed={inWishlist}
                                className={`inline-flex items-center gap-1 md:hidden ${inWishlist ? "font-medium text-admin-primary" : "text-admin-text-secondary"
                                    }`}
                            >
                                <Heart className={`h-4 w-4 shrink-0 ${inWishlist ? "fill-current" : ""}`} aria-hidden />
                                {inWishlist ? "В избранном" : "В избранное"}
                            </button>
                            <button
                                type="button"
                                onClick={shareProduct}
                                className="inline-flex items-center gap-1 text-admin-text-secondary md:hidden"
                            >
                                <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                                {shareCopied ? "Скопировано" : "Поделиться"}
                            </button>
                        </div>
                    </div>

                    <div className="order-5 md:order-none">
                        {variants.length > 0 ? (
                            <>
                                <div className="mb-3 text-lg font-semibold text-admin-text">Выбор вариантов</div>
                                <div className="mb-4 xl:mb-0">
                                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                        {variants.map((variant) => {
                                            const isSelected = variant.id === selectedVariantId;
                                            const availability = getVariantAvailabilityState(
                                                variant,
                                                product.is_out_of_stock,
                                            );
                                            const gridPrice = variantCustomerPrice(variant);
                                            const designLabel = formatVariantDesignLabel(variant);
                                            const inStore = availability.text === "В наличии";
                                            const onOrder = availability.text === "Доступен" || availability.text === "Под заказ" || availability.text === "Предзаказ";
                                            const badgeClass = inStore
                                                ? "bg-[#E0F7EE] text-[#087D4B]"
                                                : onOrder
                                                    ? "bg-[#FFF0E3] text-[#E96900]"
                                                    : "bg-red-50 text-red-600";

                                            const isNewDesign = designLabel?.toLowerCase().includes("нов") ?? false;

                                            return (
                                                <button
                                                    key={`variant-${variant.id}`}
                                                    type="button"
                                                    onClick={() => setSelectedVariantId(variant.id)}
                                                    className={`flex h-full w-full cursor-pointer overflow-hidden rounded-2xl border text-left transition-colors ${isSelected
                                                        ? "border-[#159B6A] bg-[#F3FBF7]"
                                                        : "border-[#E2E6EB] bg-white active:scale-[0.98]"
                                                        }`}
                                                >
                                                    {designLabel ? (
                                                        <span
                                                            className={`relative w-4 shrink-0 self-stretch overflow-hidden ${isNewDesign
                                                                ? "bg-[#E0F7EE] text-[#087D4B]"
                                                                : "bg-[#F4F6F8] text-[#667085]"
                                                                }`}
                                                        >
                                                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap text-[9px] font-medium leading-none">
                                                                {designLabel}
                                                            </span>
                                                        </span>
                                                    ) : null}
                                                    <span className="flex min-w-0 flex-1 flex-col px-3 py-3">
                                                        <span className="block break-words text-[15px] font-semibold leading-5 text-[#141C2E]">
                                                            {formatVariantVolumeLine(variant)}
                                                        </span>
                                                        <span className="mt-0.5 block break-words text-[13px] leading-4 text-[#667085]">
                                                            {variant.is_set ? "набор" : formatVariantConcentrationLabel(variant)}
                                                        </span>
                                                        {variant.is_promotion ? (
                                                            <span className="mt-1 inline-flex w-fit rounded-full bg-[#8E2C3B] px-1.5 py-px text-[8px] font-semibold uppercase leading-3 tracking-wide text-[#F6E7D6]">
                                                                Акция
                                                            </span>
                                                        ) : null}
                                                        <span className="mt-2 flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
                                                            <span className="whitespace-nowrap text-[15px] font-bold leading-none text-[#141C2E] min-[393px]:text-[17px] lg:text-[16px]">
                                                                {gridPrice ? formatProductDetailPrice(gridPrice) : "—"}
                                                            </span>
                                                            <span className={`ml-auto inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-4 lg:px-1 lg:py-px lg:text-[10px] lg:leading-3 ${badgeClass}`}>
                                                                {availability.text}
                                                            </span>
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {product.replacement ? (
                                        <div className="mt-4">
                                            <ProductDiscontinuedReplacement
                                                replacement={product.replacement}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : product.replacement ? (
                            <div className="mb-6">
                                <ProductDiscontinuedReplacement replacement={product.replacement} />
                            </div>
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
                    </div>
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
                            replacement={product.replacement ?? null}
                            surface="desktop"
                        />
                    </div>
                </aside>

                <section className="order-6 md:order-none md:col-span-2 xl:[grid-area:service]">
                    <ProductServiceInfo delivery={deliveryInfo} />
                </section>

                <section id="product-info-tabs" className="order-7 min-w-0 md:order-none md:col-span-2 xl:[grid-area:tabs]">
                    <div>
                        <div
                            className="flex items-center gap-2 overflow-x-auto border-b border-admin-border pb-3"
                            role="tablist"
                            aria-label="Информация о товаре"
                        >
                            <button
                                type="button"
                                role="tab"
                                id="product-tab-attributes"
                                aria-controls="product-tabpanel-attributes"
                                aria-selected={activeTab === "attributes"}
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "attributes"
                                    ? "bg-admin-primary text-white"
                                    : "text-admin-text-secondary hover:text-admin-text"
                                    }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                role="tab"
                                id="product-tab-reviews"
                                aria-controls="product-tabpanel-reviews"
                                aria-selected={activeTab === "reviews"}
                                onClick={() => setActiveTab("reviews")}
                                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "reviews"
                                    ? "bg-admin-primary text-white"
                                    : "text-admin-text-secondary hover:text-admin-text"
                                    }`}
                                aria-label={`Отзывы, ${reviewsTabCount}`}
                            >
                                Отзывы
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1 text-[11px] font-semibold leading-none tabular-nums text-brand-charcoal">
                                    {reviewsTabCount}
                                </span>
                            </button>
                        </div>

                        <div className="pt-1 sm:pt-2">
                            <div
                                className={activeTab === "attributes" ? "block" : "hidden"}
                                role="tabpanel"
                                id="product-tabpanel-attributes"
                                aria-labelledby="product-tab-attributes"
                                aria-hidden={activeTab !== "attributes"}
                            >
                                {attributesContent}
                            </div>

                            <div
                                className={activeTab === "reviews" ? "block" : "hidden"}
                                role="tabpanel"
                                id="product-tabpanel-reviews"
                                aria-labelledby="product-tab-reviews"
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
