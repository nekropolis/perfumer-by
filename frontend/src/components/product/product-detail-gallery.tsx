"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProductDetailData } from "@/types/catalog";
import ProductStatusLabels from "@/components/product/product-status-labels";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import {
    normalizeProductImageUrl,
    productImageLoader,
    productImagePathForContext,
} from "@/lib/product-image-url";
import { productDisplayName } from "@/lib/product-display-name";
import { normalizeProductImages } from "@/lib/product-detail-utils";

type Props = {
    product: ProductDetailData;
    selectedVariantHasPromotion: boolean;
    mobileBackAction?: ReactNode;
    mobileActions?: ReactNode;
};

export default function ProductDetailGallery({
    product,
    selectedVariantHasPromotion,
    mobileBackAction,
    mobileActions,
}: Props) {
    const { isInWishlist, toggleWishlist } = useWishlist();
    const inWishlist = isInWishlist(product.id);
    const images = useMemo(() => normalizeProductImages(product.images), [product.images]);
    const defaultImage = images.find((image) => image.is_main) || images[0] || null;

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
        [defaultImage?.id, images],
    );

    const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);

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

    const activeImageIndex = lightboxImageIndex;

    return (
        <>
            <section>
                <div className="relative w-full">
                    <div className="relative aspect-[5/4] max-h-[min(36dvh,236px)] w-full overflow-hidden rounded-3xl border border-admin-border bg-white shadow-sm [@media(min-height:780px)]:max-h-[min(42dvh,300px)] [@media(min-height:900px)]:max-h-[min(46dvh,360px)] sm:aspect-[4/5] sm:max-h-[min(44dvh,320px)] [@media(min-height:780px)]:sm:max-h-[min(48dvh,380px)] md:aspect-square md:max-h-none">
                        <ProductStatusLabels
                            isNew={Boolean(product.is_new)}
                            isHit={Boolean(product.is_hit)}
                            hasPromotion={selectedVariantHasPromotion}
                            className="max-md:!left-12"
                        />
                        {/* Небольшой зазор снизу под наезд превью, без лишнего пустого поля. */}
                        <div className="absolute inset-0 p-2 max-md:bottom-5 sm:p-3 md:bottom-0">
                            {mainImageUrl ? (
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
                                        className="object-contain object-center"
                                    />
                                </button>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-admin-bg to-admin-surface text-admin-text-secondary">
                                    <div className="mb-4 rounded-2xl border border-admin-border bg-admin-surface p-4 shadow-sm">
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

                                    <div className="text-base font-medium text-admin-text-secondary">Фото появится позже</div>
                                    <div className="mt-2 text-sm text-admin-text-secondary">Изображение товара загружается</div>
                                </div>
                            )}
                        </div>
                        {mobileBackAction ? (
                            <div className="absolute left-2 top-2 z-30 md:hidden">{mobileBackAction}</div>
                        ) : null}
                        {mobileActions ? (
                            <div className="absolute right-2 top-2 z-30 flex flex-col gap-1.5 md:hidden">{mobileActions}</div>
                        ) : null}
                        {images.length > 1 ? (
                            <div className="pointer-events-none absolute bottom-7 left-3 z-20 rounded-full border border-admin-border bg-white/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-admin-text-secondary shadow-sm md:hidden">
                                {activeImageIndex + 1}/{images.length}
                            </div>
                        ) : null}
                    </div>

                    {images.length > 1 ? (
                        <div className="relative z-10 -mt-3.5 flex gap-1.5 overflow-x-auto px-2 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mt-4 sm:gap-2 md:mt-3 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
                            {images.map((image, index) => {
                                const thumbUrl = normalizeProductImageUrl(productImagePathForContext(image, "thumb"));
                                const isActive = image.id === (mainImage?.id ?? null);

                                return (
                                    <button
                                        key={image.id}
                                        type="button"
                                        onClick={() => setSelectedImageId(image.id)}
                                        className={`relative aspect-square w-11 shrink-0 overflow-hidden rounded-xl border bg-white shadow-sm sm:w-14 md:w-auto md:shadow-none ${isActive ? "border-admin-primary ring-1 ring-admin-primary/25" : "border-admin-border"}`}
                                    >
                                        <div className="relative h-full w-full bg-[var(--image-plate)] p-1">
                                            <Image
                                                src={thumbUrl}
                                                loader={productImageLoader}
                                                alt={image.alt?.trim() || `${productDisplayName(product)} — фото ${index + 1}`}
                                                fill
                                                loading="lazy"
                                                sizes="96px"
                                                className="object-contain"
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </section>

            {isImageLightboxOpen && mainImageFullUrl ? (
                <div
                    className="fixed inset-0 z-[220] flex flex-col bg-black"
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                        lightboxHasMultiple
                            ? "Галерея изображений товара в полном размере"
                            : "Изображение товара в полном размере"
                    }
                >
                    <div className="relative z-20 flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                        <button
                            type="button"
                            onClick={() => setIsImageLightboxOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center text-white transition active:opacity-70"
                            aria-label="Закрыть полноразмерное изображение"
                        >
                            <X className="h-6 w-6" strokeWidth={2} aria-hidden />
                        </button>
                        <p className="text-sm font-medium tabular-nums text-white" aria-live="polite">
                            {lightboxImageIndex + 1}/{images.length || 1}
                        </p>
                        <button
                            type="button"
                            onClick={() => void toggleWishlist(product.id)}
                            aria-pressed={inWishlist}
                            aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
                            className="inline-flex h-10 w-10 items-center justify-center text-white transition active:opacity-70"
                        >
                            <Heart
                                className={`h-6 w-6 ${inWishlist ? "fill-white" : "fill-transparent"}`}
                                strokeWidth={2}
                                aria-hidden
                            />
                        </button>
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
                        {lightboxHasMultiple ? (
                            <button
                                type="button"
                                onClick={() => advanceLightboxImage(-1)}
                                className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-admin-text shadow-sm transition hover:bg-white active:scale-95 sm:left-4"
                                aria-label="Предыдущее изображение"
                            >
                                <ChevronLeft className="h-5 w-5" aria-hidden />
                            </button>
                        ) : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={mainImageFullUrl}
                            alt={mainImage?.alt?.trim() || productDisplayName(product)}
                            className="block h-auto max-h-full w-auto max-w-full object-contain"
                        />
                        {lightboxHasMultiple ? (
                            <button
                                type="button"
                                onClick={() => advanceLightboxImage(1)}
                                className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-admin-text shadow-sm transition hover:bg-white active:scale-95 sm:right-4"
                                aria-label="Следующее изображение"
                            >
                                <ChevronRight className="h-5 w-5" aria-hidden />
                            </button>
                        ) : null}
                    </div>

                    {lightboxHasMultiple ? (
                        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                            <div
                                className="flex justify-center gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                aria-label="Миниатюры изображений"
                            >
                                {images.map((image, index) => {
                                    const thumbUrl = normalizeProductImageUrl(
                                        productImagePathForContext(image, "thumb"),
                                    );
                                    const isActive = image.id === (mainImage?.id ?? null);
                                    return (
                                        <button
                                            key={image.id}
                                            type="button"
                                            onClick={() => setSelectedImageId(image.id)}
                                            aria-current={isActive ? "true" : undefined}
                                            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-0.5 transition ${
                                                isActive
                                                    ? "border-admin-primary"
                                                    : "border-transparent opacity-80 hover:opacity-100"
                                            }`}
                                            aria-label={`Фото ${index + 1}`}
                                        >
                                            <Image
                                                src={thumbUrl}
                                                loader={productImageLoader}
                                                alt={
                                                    image.alt?.trim() ||
                                                    `${productDisplayName(product)} — фото ${index + 1}`
                                                }
                                                fill
                                                sizes="64px"
                                                className="object-contain"
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
                    )}
                </div>
            ) : null}
        </>
    );
}
