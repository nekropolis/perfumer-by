"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProductDetailData, ProductImageData, ProductListItem, ProductVariantData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";
import { useTransition } from "react";
import { addToCart } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { getProductBreadcrumbItems } from "@/lib/product-breadcrumbs";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import CopyText from "@/components/ui/copy-text";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductServiceInfo from "@/components/product/product-service-info";
import ProductReviewsTab from "@/components/product/product-reviews-tab";
import {
    normalizeProductImageUrl,
    productImageLoader,
    productImagePathForContext,
} from "@/lib/product-image-url";
import { productDisplayName } from "@/lib/product-display-name";
import ProductStatusLabels from "@/components/product/product-status-labels";
import ProductCard from "@/components/product/product-card";
import { applyPercentDiscount, resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";
import { formatMoneyDisplay } from "@/lib/format-money-display";

/** Минимум карточек в блоке «Похожие товары»; иначе блок скрыт. */
const SIMILAR_PRODUCTS_MIN_TO_SHOW = 4;

type Props = {
    product: ProductDetailData;
    /** SSR: начальное состояние вкладки; для view-source/SEO — `ProductReviewsSeoHtml` в `page.tsx`. */
    initialProductReviews?: ReviewItem[];
};

function formatPrice(price: string | null) {
    if (!price) return "—";
    const v = formatMoneyDisplay(price);
    return v ? `${v} BYN` : "—";
}

function normalizeImages(value: unknown): ProductImageData[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is ProductImageData => Boolean(item && typeof item === "object"));
    }

    if (value && typeof value === "object") {
        return Object.values(value).filter((item): item is ProductImageData => Boolean(item && typeof item === "object"));
    }

    return [];
}

function normalizeVariants(value: unknown): ProductVariantData[] {
    const normalizeList = (items: unknown[]): ProductVariantData[] => {
        const byId = new Map<number, ProductVariantData>();
        for (const raw of items) {
            if (!raw || typeof raw !== "object") {
                continue;
            }
            const candidate = raw as Partial<ProductVariantData>;
            const id = Number(candidate.id);
            if (!Number.isFinite(id) || id <= 0) {
                continue;
            }
            byId.set(id, { ...candidate, id } as ProductVariantData);
        }
        return Array.from(byId.values());
    };

    if (Array.isArray(value)) {
        return normalizeList(value);
    }

    if (value && typeof value === "object") {
        return normalizeList(Object.values(value));
    }

    return [];
}

const SIMILAR_GAP_PX = 12;

function similarVisibleColumns(): 2 | 3 | 4 {
    if (typeof window === "undefined") {
        return 2;
    }
    if (window.matchMedia("(min-width: 1024px)").matches) {
        return 4;
    }
    if (window.matchMedia("(min-width: 768px)").matches) {
        return 3;
    }
    return 2;
}

function SimilarProductsCarousel({ products }: { products: ProductListItem[] }) {
    const scrollerId = useId();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState(false);
    const [edge, setEdge] = useState({ left: false, right: false });
    /** До первого измерения; useLayoutEffect сразу подставит ширину под число колонок. */
    const [slideWidthPx, setSlideWidthPx] = useState(200);

    const syncScrollState = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        setOverflow(maxScroll > 2);
        setEdge({
            left: scrollLeft > 2,
            right: scrollLeft < maxScroll - 2,
        });
    }, []);

    const measureSlides = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        const cols = similarVisibleColumns();
        const w = el.clientWidth;
        const slide = Math.floor((w - SIMILAR_GAP_PX * (cols - 1)) / cols);
        setSlideWidthPx(Math.max(132, slide));
        syncScrollState();
    }, [syncScrollState]);

    useLayoutEffect(() => {
        measureSlides();
    }, [products, measureSlides]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        syncScrollState();
        el.addEventListener("scroll", syncScrollState, { passive: true });
        const ro = new ResizeObserver(() => measureSlides());
        ro.observe(el);
        const onMq = () => measureSlides();
        const mql1024 = window.matchMedia("(min-width: 1024px)");
        const mql768 = window.matchMedia("(min-width: 768px)");
        mql1024.addEventListener("change", onMq);
        mql768.addEventListener("change", onMq);
        return () => {
            el.removeEventListener("scroll", syncScrollState);
            ro.disconnect();
            mql1024.removeEventListener("change", onMq);
            mql768.removeEventListener("change", onMq);
        };
    }, [products, syncScrollState, measureSlides]);

    const scrollByViewport = useCallback(
        (dir: -1 | 1) => {
            const el = scrollerRef.current;
            if (!el) {
                return;
            }
            const cols = similarVisibleColumns();
            const step = cols * slideWidthPx + (cols - 1) * SIMILAR_GAP_PX;
            el.scrollBy({ left: dir * step, behavior: "smooth" });
        },
        [slideWidthPx],
    );

    return (
        <section
            className="col-span-1 min-w-0 border-t border-[var(--line)] pt-10 md:col-span-2 xl:col-span-3"
            aria-labelledby={scrollerId}
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id={scrollerId} className="text-lg font-semibold text-[var(--foreground)]">
                    Похожие товары
                </h2>
                {overflow ? (
                    <div className="flex shrink-0 gap-1">
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить похожие товары назад"
                            disabled={!edge.left}
                            onClick={() => scrollByViewport(-1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm transition hover:bg-[var(--background)] disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить похожие товары вперёд"
                            disabled={!edge.right}
                            onClick={() => scrollByViewport(1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm transition hover:bg-[var(--background)] disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronRight className="h-5 w-5" aria-hidden />
                        </button>
                    </div>
                ) : null}
            </div>
            <nav aria-label="Похожие товары" className="min-w-0 w-full">
                <div
                    ref={scrollerRef}
                    id={`${scrollerId}-track`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            scrollByViewport(-1);
                        } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            scrollByViewport(1);
                        }
                    }}
                    className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]"
                >
                    <div className="mt-2 flex w-max snap-x snap-mandatory gap-3">
                        {products.map((item) => (
                            <div
                                key={item.id}
                                className="min-w-0 shrink-0 snap-start"
                                style={{ width: slideWidthPx, flex: "0 0 auto" }}
                            >
                                <ProductCard product={item} />
                            </div>
                        ))}
                    </div>
                </div>
            </nav>
        </section>
    );
}

export default function ProductDetailView({ product, initialProductReviews }: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "reviews">("attributes");
    const reviewsTabCount = initialProductReviews?.length ?? 0;
    const { cart, setCartState } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const { user, isAuthenticated } = useAuth();
    const variants = useMemo(() => normalizeVariants(product.variants), [product.variants]);
    const images = useMemo(() => normalizeImages(product.images), [product.images]);
    const defaultImage = images.find((image) => image.is_main) || images[0] || null;

    const defaultVariant =
        variants.find((variant) => variant.id === product.default_variant_id) ||
        variants[0] ||
        null;

    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
        defaultVariant?.id ?? null
    );

    const selectedVariant = useMemo<ProductVariantData | null>(() => {
        return variants.find((variant) => variant.id === selectedVariantId) || null;
    }, [variants, selectedVariantId]);
    const isSelectedVariantInCart = Boolean(
        selectedVariant?.id &&
        cart?.items?.some((item) => item.product_variant_id === selectedVariant.id)
    );
    const selectedVariantHasDiscount = Boolean(
        selectedVariant &&
        selectedVariant.old_price &&
        selectedVariant.price &&
        Number(selectedVariant.old_price) > Number(selectedVariant.price)
    );
    const loyaltyCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const loyaltyPrice = applyPercentDiscount(selectedVariant?.price ?? null, loyaltyCard?.discountPercent ?? 0);

    const [selectedImageId, setSelectedImageId] = useState<number | null>(defaultImage?.id ?? null);
    const mainImage = useMemo(() => {
        if (selectedImageId == null) {
            return defaultImage;
        }
        return images.find((image) => image.id === selectedImageId) || defaultImage;
    }, [defaultImage, images, selectedImageId]);

    const mainImageUrl =
        mainImage == null
            ? null
            : normalizeProductImageUrl(productImagePathForContext(mainImage, "card"));
    const mainImageFullUrl =
        mainImage == null
            ? null
            : normalizeProductImageUrl(productImagePathForContext(mainImage, "full"));
    const lightboxImageIndex = useMemo(() => {
        if (!mainImage) {
            return 0;
        }
        const i = images.findIndex((image) => image.id === mainImage.id);
        return i >= 0 ? i : 0;
    }, [images, mainImage]);
    const lightboxHasMultiple = images.length > 1;
    const advanceLightboxImage = useCallback(
        (delta: -1 | 1) => {
            if (images.length <= 1) {
                return;
            }
            setSelectedImageId((prev) => {
                const resolved = prev ?? defaultImage?.id ?? images[0]?.id ?? null;
                if (resolved == null) {
                    return prev;
                }
                const i = images.findIndex((image) => image.id === resolved);
                const base = i >= 0 ? i : 0;
                const next = (base + delta + images.length) % images.length;
                return images[next].id;
            });
        },
        [defaultImage?.id, images, setSelectedImageId],
    );
    const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);
    const [showMobileBuyBar, setShowMobileBuyBar] = useState(false);
    const [mobileBarBottomOffset, setMobileBarBottomOffset] = useState(0);
    const buyBoxAsideRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isImageLightboxOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsImageLightboxOpen(false);
                return;
            }
            if (images.length <= 1) {
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                advanceLightboxImage(-1);
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                advanceLightboxImage(1);
            }
        };

        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [advanceLightboxImage, images.length, isImageLightboxOpen]);

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
        if (!selectedVariant?.id) return;

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
        <main className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 xl:pb-8">
            <Breadcrumbs className="mb-4" items={getProductBreadcrumbItems(product)} />

            <div className="grid grid-cols-1 gap-8 md:grid-cols-[320px_minmax(0,1fr)] md:items-start xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                <section>
                    <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--image-plate)] p-2 shadow-sm sm:p-3">
                        <ProductStatusLabels
                            isNew={Boolean(product.is_new)}
                            isHit={Boolean(product.is_hit)}
                            hasDiscount={selectedVariantHasDiscount}
                        />
                        {mainImageUrl ? (
                            <div className="h-full w-full">
                                <button
                                    type="button"
                                    onClick={() => setIsImageLightboxOpen(true)}
                                    className="relative z-[1] block h-full w-full cursor-zoom-in"
                                    aria-label="Открыть изображение в полном размере"
                                >
                                    <Image
                                        src={mainImageUrl}
                                        loader={productImageLoader}
                                        alt={mainImage?.alt?.trim() || productDisplayName(product)}
                                        fill
                                        priority
                                        loading="eager"
                                        sizes="(max-width: 1280px) 100vw, 320px"
                                        className="object-contain"
                                    />
                                </button>
                            </div>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--surface)] text-[var(--text-secondary)]">
                                <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        className="h-12 w-12"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M2.25 15.75l4.159-4.159a2.25 2.25 0 013.182 0l.409.409a2.25 2.25 0 003.182 0l2.659-2.659a2.25 2.25 0 013.182 0l2.727 2.727M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                                        />
                                    </svg>
                                </div>

                                <div className="text-base font-medium text-[var(--text-secondary)]">Фото появится позже</div>
                                <div className="mt-1 text-sm text-[var(--text-secondary)]">Изображение товара загружается</div>
                            </div>
                        )}
                    </div>

                    {images.length > 1 ? (
                        <div className="mt-3 grid grid-cols-5 gap-2">
                            {images.map((image, index) => {
                                const thumbUrl = normalizeProductImageUrl(
                                    productImagePathForContext(image, "thumb")
                                );
                                const isActive = image.id === (mainImage?.id ?? null);

                                return (
                                    <button
                                        key={image.id}
                                        type="button"
                                        onClick={() => setSelectedImageId(image.id)}
                                        className={`relative aspect-square overflow-hidden rounded-xl border ${isActive ? "border-[var(--accent)] ring-1 ring-[var(--accent-soft)]" : "border-[var(--line)]"}`}
                                    >
                                        <div className="relative h-full w-full bg-[var(--image-plate)] p-1">
                                            <Image
                                                src={thumbUrl}
                                                loader={productImageLoader}
                                                alt={image.alt?.trim() || `${productDisplayName(product)} — фото ${index + 1}`}
                                                fill
                                                loading="eager"
                                                sizes="96px"
                                                className="object-contain"
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </section>

                <section className="min-w-0">
                    <div className="mb-2 flex items-center gap-1 text-sm text-[var(--text-secondary)]">
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
                        className={`mb-5 inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition ${isInWishlist(product.id)
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)] hover:bg-[var(--accent-hover)]"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                            }`}
                    >
                        <span aria-hidden>{isInWishlist(product.id) ? "♥" : "♡"}</span>
                        <span>{isInWishlist(product.id) ? "В избранном" : "В избранное"}</span>
                    </button>


                    {variants.length > 0 ? (
                        <>

                            <div className="mb-3 text-sm font-medium text-[var(--foreground)]">Выбор вариантов</div>
                            <div className="mb-6 rounded-3xl border border-[var(--line)] bg-[var(--background)] p-3">
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
                                                className={`group cursor-pointer rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 ${isSelected
                                                    ? "bg-[var(--surface)] border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-soft)]"
                                                    : "bg-[var(--surface)] border-[var(--line)] hover:bg-[var(--background)] hover:border-[var(--accent-soft)] hover:-translate-y-[1px] active:scale-[0.97]"
                                                    }`}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-medium leading-5">
                                                        {variant.display_name}
                                                    </span>

                                                    <div className="flex items-center gap-2">
                                                        {variant.price && (
                                                            <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--foreground)]">
                                                                {formatPrice(
                                                                    isAuthenticated && loyaltyCard
                                                                        ? applyPercentDiscount(variant.price, loyaltyCard.discountPercent)
                                                                        : variant.price
                                                                )}
                                                            </span>
                                                        )}

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
                        formatPriceAction={formatPrice}
                        productId={product.id}
                        productName={productDisplayName(product)}
                        isProductOutOfStock={product.is_out_of_stock}
                        loyaltyCardNumber={isAuthenticated ? loyaltyCard?.number ?? null : null}
                        loyaltyPercent={isAuthenticated ? loyaltyCard?.discountPercent ?? 0 : 0}
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
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
                        <div className="flex overflow-x-auto border-b border-[var(--line)]" role="tablist" aria-label="Информация о товаре">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "attributes"}
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 whitespace-nowrap px-6 py-4 text-sm font-medium ${activeTab === "attributes"
                                    ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                                    : "text-[var(--text-secondary)]"
                                    }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "reviews"}
                                onClick={() => setActiveTab("reviews")}
                                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-6 py-4 text-sm font-medium ${activeTab === "reviews"
                                    ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                                    : "text-[var(--text-secondary)]"
                                    }`}
                            >
                                <span>Отзывы</span>
                                <span
                                    className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--background)]"
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
                                <h2 id="product-specs-heading" className="sr-only">
                                    Характеристики
                                </h2>
                                {product.attribute_values.length > 0 ? (
                                    <dl className="space-y-3" aria-labelledby="product-specs-heading">
                                        {product.attribute_values.map((item) => {
                                            const label = item.attribute?.name || "Характеристика";

                                            const valueText =
                                                item.selected_options.length > 0
                                                    ? item.selected_options.map((option) => option.name).join(", ")
                                                    : item.custom_value || "—";

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="grid grid-cols-1 gap-1 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4"
                                                >
                                                    <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
                                                    <dd className="text-sm text-[var(--foreground)]">{valueText}</dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                ) : (
                                    <div className="text-sm text-[var(--text-secondary)]">Характеристики отсутствуют</div>
                                )}
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

                            {product.description ? (
                                <section
                                    className="mt-8 border-t border-[var(--line)] pt-8"
                                    aria-labelledby="product-description-heading"
                                >
                                    <h2
                                        id="product-description-heading"
                                        className="mt-3 mb-3 text-base font-semibold text-[var(--foreground)]"
                                    >
                                        Описание продукта
                                    </h2>
                                    <div
                                        className="prose prose-sm max-w-none text-[var(--foreground)] sm:prose-base"
                                        dangerouslySetInnerHTML={{ __html: product.description }}
                                    />
                                </section>
                            ) : null}
                        </div>
                    </div>
                </section>
            </div>
            {showMobileBuyBar ? (
                <div
                    className="fixed inset-x-0 bottom-0 z-[130] border-t border-[var(--line)] bg-[var(--surface)]/95 px-3 pt-3 backdrop-blur xl:hidden"
                    style={{
                        bottom: `${mobileBarBottomOffset}px`,
                        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                    }}
                >
                    <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                {product.h1 || productDisplayName(product)}
                            </div>
                            <div className="truncate text-xs text-[var(--text-secondary)]">
                                {selectedVariant?.display_name || "Вариант не выбран"}
                            </div>
                            <div className="text-base font-semibold text-[var(--foreground)]">
                                {selectedVariant
                                    ? formatPrice(
                                        isAuthenticated && loyaltyPrice ? loyaltyPrice : selectedVariant.price
                                    )
                                    : "Цена уточняется"}
                            </div>
                        </div>
                        {isSelectedVariantInCart ? (
                            <Link
                                href="/cart"
                                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-soft)] bg-[var(--background)] px-4 text-sm font-medium text-[var(--accent)]"
                            >
                                В корзине (оформить)
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={handleAddToCart}
                                disabled={!selectedVariant?.is_available || isPending}
                                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isPending ? "Добавление..." : "В корзину"}
                            </button>
                        )}
                    </div>
                </div>
            ) : null}
            {isImageLightboxOpen && mainImageFullUrl ? (
                <div
                    className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-3 sm:p-6"
                    role="presentation"
                    onClick={() => setIsImageLightboxOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            lightboxHasMultiple
                                ? "Галерея изображений товара в полном размере"
                                : "Изображение товара в полном размере"
                        }
                        className="relative max-h-[96vh] max-w-[96vw] overflow-auto rounded-2xl bg-black/30 p-2 sm:p-3"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setIsImageLightboxOpen(false)}
                            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
                            aria-label="Закрыть полноразмерное изображение"
                        >
                            ×
                        </button>
                        <div className="flex flex-col items-center gap-3 pt-1">
                            <div className="relative flex max-w-full items-center justify-center px-10 sm:px-12">
                                {lightboxHasMultiple ? (
                                    <button
                                        type="button"
                                        onClick={() => advanceLightboxImage(-1)}
                                        className="absolute left-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 sm:left-1"
                                        aria-label="Предыдущее изображение"
                                    >
                                        <ChevronLeft className="h-6 w-6" aria-hidden />
                                    </button>
                                ) : null}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={mainImageFullUrl}
                                    alt={mainImage?.alt?.trim() || productDisplayName(product)}
                                    className="block h-auto w-auto max-h-[min(92vh,720px)] max-w-[92vw] object-contain"
                                />
                                {lightboxHasMultiple ? (
                                    <button
                                        type="button"
                                        onClick={() => advanceLightboxImage(1)}
                                        className="absolute right-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 sm:right-1"
                                        aria-label="Следующее изображение"
                                    >
                                        <ChevronRight className="h-6 w-6" aria-hidden />
                                    </button>
                                ) : null}
                            </div>
                            {lightboxHasMultiple ? (
                                <>
                                    <p className="text-center text-xs text-white/75" aria-live="polite">
                                        {lightboxImageIndex + 1} / {images.length}
                                    </p>
                                    <div
                                        className="flex max-w-[min(92vw,720px)] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                        aria-label="Миниатюры изображений"
                                    >
                                        {images.map((image, index) => {
                                            const thumbUrl = normalizeProductImageUrl(
                                                productImagePathForContext(image, "thumb")
                                            );
                                            const isActive = image.id === (mainImage?.id ?? null);
                                            return (
                                                <button
                                                    key={image.id}
                                                    type="button"
                                                    onClick={() => setSelectedImageId(image.id)}
                                                    aria-current={isActive ? "true" : undefined}
                                                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white/95 p-0.5 transition ${
                                                        isActive
                                                            ? "border-white ring-2 ring-white/90"
                                                            : "border-white/25 opacity-80 hover:opacity-100"
                                                    }`}
                                                    aria-label={`Фото ${index + 1}`}
                                                >
                                                    <Image
                                                        src={thumbUrl}
                                                        loader={productImageLoader}
                                                        alt={image.alt?.trim() || `${productDisplayName(product)} — фото ${index + 1}`}
                                                        fill
                                                        sizes="56px"
                                                        className="object-contain"
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
            {product.similar_products && product.similar_products.length >= SIMILAR_PRODUCTS_MIN_TO_SHOW ? (
                <SimilarProductsCarousel products={product.similar_products} />
            ) : null}
        </main>
    );
}