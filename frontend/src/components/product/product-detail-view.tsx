"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ProductDetailData, ProductImageData, ProductVariantData } from "@/types/catalog";
import { useTransition } from "react";
import { addToCart } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { useAuth } from "@/components/auth/auth-provider";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import CopyText from "@/components/ui/copy-text";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductServiceInfo from "@/components/product/product-service-info";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import ProductStatusLabels from "@/components/product/product-status-labels";
import { applyPercentDiscount, resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";

type Props = {
    product: ProductDetailData;
};

function formatPrice(price: string | null) {
    if (!price) return "—";
    return `${price} BYN`;
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

export default function ProductDetailView({ product }: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "description">("attributes");
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
            : normalizeProductImageUrl(mainImage.path);

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
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Каталог", href: "/catalog" },
                    ...(product.brand
                        ? [{ label: product.brand.name, href: `/brands/${product.brand.slug}` }]
                        : []),
                    { label: product.name },
                ]}
            />

            <div className="grid grid-cols-1 gap-8 md:grid-cols-[320px_minmax(0,1fr)] md:items-start xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                <section>
                    <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
                        <ProductStatusLabels
                            isNew={Boolean(product.is_new)}
                            isHit={Boolean(product.is_hit)}
                            hasDiscount={selectedVariantHasDiscount}
                        />
                        {mainImageUrl ? (
                            <Image
                                src={mainImageUrl}
                                loader={productImageLoader}
                                alt={mainImage?.alt?.trim() || product.name}
                                fill
                                priority
                                loading="eager"
                                sizes="(max-width: 1280px) 100vw, 320px"
                                className="object-cover"
                            />
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
                                const thumbUrl = normalizeProductImageUrl(image.path);
                                const isActive = image.id === (mainImage?.id ?? null);

                                return (
                                    <button
                                        key={image.id}
                                        type="button"
                                        onClick={() => setSelectedImageId(image.id)}
                                        className={`relative aspect-square overflow-hidden rounded-xl border ${isActive ? "border-[var(--accent)] ring-1 ring-[var(--accent-soft)]" : "border-[var(--line)]"}`}
                                    >
                                        <Image
                                            src={thumbUrl}
                                            loader={productImageLoader}
                                            alt={image.alt?.trim() || `${product.name} — фото ${index + 1}`}
                                            fill
                                            loading="eager"
                                            sizes="96px"
                                            className="object-cover"
                                        />
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
                        {product.h1 || product.name}
                    </h1>

                    <button
                        type="button"
                        onClick={() => void toggleWishlist(product.id)}
                        className={`mb-5 inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition ${
                            isInWishlist(product.id)
                                ? "border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-95"
                                : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--background)]"
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
                                        let availabilityClass = "text-red-500";

                                        if (variant.is_available) {
                                            if (variant.is_preorder) {
                                                availabilityText = "Предзаказ";
                                                availabilityClass = "text-amber-600";
                                            } else {
                                                availabilityText = "В наличии";
                                                availabilityClass = "text-green-600";
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
                        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
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

                <aside className="self-start md:col-span-2 xl:col-span-1 xl:sticky xl:top-24">
                    <ProductBuyBox
                        selectedVariant={selectedVariant}
                        isSelectedVariantInCart={isSelectedVariantInCart}
                        isPending={isPending}
                        onAddToCartAction={handleAddToCart}
                        formatPriceAction={formatPrice}
                        productId={product.id}
                        productName={product.name}
                        loyaltyCardNumber={isAuthenticated ? loyaltyCard?.number ?? null : null}
                        loyaltyPercent={isAuthenticated ? loyaltyCard?.discountPercent ?? 0 : 0}
                        loyaltyPrice={isAuthenticated ? loyaltyPrice : null}
                    />
                </aside>

                <section className="md:col-span-2 xl:col-span-2">
                    <ProductServiceInfo />
                </section>

                <section className="min-w-0 md:col-span-2 xl:col-span-2">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
                        <div className="flex overflow-x-auto border-b border-[var(--line)]">
                            <button
                                type="button"
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 px-6 py-4 text-sm font-medium ${activeTab === "attributes"
                                    ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                                    : "text-[var(--text-secondary)]"
                                    }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("description")}
                                className={`shrink-0 px-6 py-4 text-sm font-medium ${activeTab === "description"
                                    ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                                    : "text-[var(--text-secondary)]"
                                    }`}
                            >
                                Описание
                            </button>
                        </div>

                        <div className="p-5 sm:p-6">
                            <div className={activeTab === "attributes" ? "block" : "hidden"}>
                                {product.attribute_values.length > 0 ? (
                                    <div className="space-y-3">
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
                                                    <div className="text-sm text-[var(--text-secondary)]">{label}</div>
                                                    <div className="text-sm">{valueText}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-sm text-[var(--text-secondary)]">Характеристики отсутствуют</div>
                                )}
                            </div>

                            <div className={activeTab === "description" ? "block" : "hidden"}>
                                {product.description ? (
                                    <div
                                        className="prose prose-sm max-w-none text-[var(--foreground)] sm:prose-base"
                                        dangerouslySetInnerHTML={{ __html: product.description }}
                                    />
                                ) : (
                                    <div className="text-sm text-[var(--text-secondary)]">Описание отсутствует</div>
                                )}
                            </div>

                            {/* Keep description in initial HTML output for SEO crawlers even when Attributes tab is active. */}
                            {activeTab !== "description" && product.description ? (
                                <div
                                    className="sr-only"
                                    aria-hidden="true"
                                    dangerouslySetInnerHTML={{ __html: product.description }}
                                />
                            ) : null}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}