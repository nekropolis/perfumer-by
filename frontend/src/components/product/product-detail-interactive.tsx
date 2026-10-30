"use client";

import { ChevronLeft, Heart, Share2, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import { addToCart, removeCartItem, updateCartItem } from "@/lib/cart-api";
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
    initialProductReviewsAverage?: number | null;
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
    initialProductReviewsAverage = null,
    attributesContent,
    descriptionContent,
    deliveryDate,
    deliveryInfo,
    variantFromQuery = 0,
}: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"about" | "description" | "reviews">("about");
    const hasDescription = Boolean(descriptionContent);

    const goBack = useCallback(() => {
        if (typeof window !== "undefined") {
            const referrer = document.referrer;
            if (referrer) {
                try {
                    const url = new URL(referrer);
                    if (
                        url.origin === window.location.origin &&
                        `${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`
                    ) {
                        router.back();
                        return;
                    }
                } catch {
                    // ignore invalid referrer
                }
            }
        }
        router.push("/catalog");
    }, [router]);
    const reviewsTabCount = initialProductReviewsTotal ?? initialProductReviews?.length ?? 0;
    const reviewsAverage = useMemo(() => {
        if (initialProductReviewsAverage != null && Number.isFinite(initialProductReviewsAverage)) {
            return initialProductReviewsAverage;
        }
        const list = initialProductReviews ?? [];
        if (list.length === 0) {
            return null;
        }
        const sum = list.reduce((acc, review) => acc + (Number(review.stars) || 0), 0);
        return sum / list.length;
    }, [initialProductReviews, initialProductReviewsAverage]);
    const reviewsAverageLabel =
        reviewsAverage != null
            ? reviewsAverage.toLocaleString("ru-RU", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            })
            : null;
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
    const brandName = product.brand?.name?.trim() || "";
    const productNameOnly = product.name.trim() || productTitle;

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

    const handleRemoveFromCart = () => {
        if (!cartItemForSelected) {
            return;
        }

        startTransition(async () => {
            try {
                const response = await removeCartItem(cartItemForSelected.id);
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

    const mobileOverlayBtnClass =
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-admin-border bg-white/95 text-admin-text shadow-sm transition active:scale-90";

    const stickyHeaderActions = (
        <>
            <button
                type="button"
                onClick={() => void toggleWishlist(product.id)}
                aria-pressed={inWishlist}
                aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-admin-border bg-white text-admin-text shadow-sm transition active:scale-90"
            >
                <Heart
                    className={`h-[18px] w-[18px] ${inWishlist ? "fill-admin-primary text-admin-primary" : "fill-transparent"}`}
                    strokeWidth={1.75}
                    aria-hidden
                />
            </button>
            <button
                type="button"
                onClick={shareProduct}
                aria-label={shareCopied ? "Ссылка скопирована" : "Поделиться"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-admin-border bg-white text-admin-text shadow-sm transition active:scale-90"
            >
                <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
        </>
    );

    const selectedVariantLine = !selectedVariant
        ? null
        : selectedVariant.is_set
            ? "Набор"
            : [formatVariantVolumeLine(selectedVariant), formatVariantConcentrationLabel(selectedVariant)]
                .filter((part) => part.trim().length > 0)
                .join(" · ");

    const reviewsSummaryButton = (
        <button
            type="button"
            onClick={openReviewsTab}
            className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
            aria-label={reviewsMetaLabel}
        >
            <Star
                className="h-4 w-4 shrink-0 text-[var(--review-star)]"
                fill="currentColor"
                strokeWidth={0}
                aria-hidden
            />
            {reviewsAverageLabel ? (
                <span className="font-medium tabular-nums text-admin-text">{reviewsAverageLabel}</span>
            ) : null}
            <span className="text-admin-text-secondary">({reviewsMetaLabel})</span>
        </button>
    );

    return (
        <>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-8 xl:grid-cols-[310px_minmax(0,1fr)_320px] xl:items-stretch xl:gap-5 xl:[grid-template-areas:'gallery_variants_buybox'_'service_service_buybox'_'tabs_tabs_buybox']">
                <div className="order-1 md:order-none xl:[grid-area:gallery]">
                    <ProductDetailGallery
                        product={product}
                        selectedVariantHasPromotion={selectedVariantHasPromotion}
                        mobileBackAction={
                            <button type="button" onClick={goBack} aria-label="Назад" className={mobileOverlayBtnClass}>
                                <ChevronLeft className="h-5 w-5" aria-hidden />
                            </button>
                        }
                        mobileActions={
                            <>
                                <button
                                    type="button"
                                    onClick={() => void toggleWishlist(product.id)}
                                    aria-pressed={inWishlist}
                                    aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                                    className={mobileOverlayBtnClass}
                                >
                                    <Heart
                                        className={`h-5 w-5 ${inWishlist ? "fill-admin-primary text-admin-primary" : "fill-transparent"}`}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={shareProduct}
                                    aria-label={shareCopied ? "Ссылка скопирована" : "Поделиться"}
                                    className={mobileOverlayBtnClass}
                                >
                                    <Share2 className="h-5 w-5" strokeWidth={2} aria-hidden />
                                </button>
                            </>
                        }
                    />
                </div>

                <section className="contents min-w-0 md:block xl:[grid-area:variants]">
                    <div className="order-2 md:order-none md:mb-2">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            {product.brand ? (
                                <Link
                                    href={`/brands/${product.brand.slug}`}
                                    className="min-w-0 truncate text-sm font-medium text-admin-text-secondary transition hover:text-admin-text"
                                >
                                    {brandName}
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
                        <h1 className="sr-only">{productTitle}</h1>
                        <p
                            className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-admin-text md:mt-1.5 md:font-display md:text-4xl md:font-semibold md:tracking-normal"
                            aria-hidden="true"
                        >
                            {productNameOnly}
                        </p>
                        {selectedVariantLine ? (
                            <div className="mt-0.5 text-sm font-medium text-admin-text-secondary md:hidden">
                                {selectedVariantLine}
                            </div>
                        ) : null}
                        <div className="mt-1">{reviewsSummaryButton}</div>
                    </div>

                    <div className="order-3 md:order-none md:mt-0">
                        <ProductBuyBox
                            selectedVariant={selectedVariant}
                            isSelectedVariantInCart={isSelectedVariantInCart}
                            isPending={isPending}
                            onAddToCartAction={handleAddToCart}
                            onRemoveFromCartAction={handleRemoveFromCart}
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
                            hideMobileVariantLine
                            onBackAction={goBack}
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

                <section id="product-info-tabs" className="order-7 mt-5 min-w-0 md:order-none md:col-span-2 md:mt-6 xl:[grid-area:tabs]">
                    <div>
                        <div
                            className="flex items-center gap-2 overflow-x-auto border-b border-admin-border pb-3"
                            role="tablist"
                            aria-label="Информация о товаре"
                        >
                            <button
                                type="button"
                                role="tab"
                                id="product-tab-about"
                                aria-controls="product-tabpanel-about"
                                aria-selected={activeTab === "about"}
                                onClick={() => setActiveTab("about")}
                                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "about"
                                    ? "bg-admin-primary text-white"
                                    : "text-admin-text-secondary hover:text-admin-text"
                                    }`}
                            >
                                О товаре
                            </button>

                            {hasDescription ? (
                                <button
                                    type="button"
                                    role="tab"
                                    id="product-tab-description"
                                    aria-controls="product-tabpanel-description"
                                    aria-selected={activeTab === "description"}
                                    onClick={() => setActiveTab("description")}
                                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "description"
                                        ? "bg-admin-primary text-white"
                                        : "text-admin-text-secondary hover:text-admin-text"
                                        }`}
                                >
                                    Описание
                                </button>
                            ) : null}

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
                                className={activeTab === "about" ? "block" : "hidden"}
                                role="tabpanel"
                                id="product-tabpanel-about"
                                aria-labelledby="product-tab-about"
                                aria-hidden={activeTab !== "about"}
                            >
                                {attributesContent}
                            </div>

                            {/* Описание всегда в DOM (hidden), чтобы SEO не теряло текст. */}
                            {hasDescription ? (
                                <div
                                    className={activeTab === "description" ? "block" : "hidden"}
                                    role="tabpanel"
                                    id="product-tabpanel-description"
                                    aria-labelledby="product-tab-description"
                                    aria-hidden={activeTab !== "description"}
                                >
                                    {descriptionContent}
                                </div>
                            ) : null}

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
                        </div>
                    </div>
                </section>
            </div>

        </>
    );
}
