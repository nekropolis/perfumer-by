"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductDetailData } from "@/types/catalog";
import ProductStatusLabels from "@/components/product/product-status-labels";
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
};

export default function ProductDetailGallery({ product, selectedVariantHasPromotion }: Props) {
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

    return (
        <>
            <section>
                <div className="relative aspect-square overflow-hidden rounded-3xl border border-admin-border bg-white p-2 shadow-sm sm:p-3">
                    <ProductStatusLabels
                        isNew={Boolean(product.is_new)}
                        isHit={Boolean(product.is_hit)}
                        hasPromotion={selectedVariantHasPromotion}
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
                            <div className="mt-1 text-sm text-admin-text-secondary">Изображение товара загружается</div>
                        </div>
                    )}
                </div>

                {images.length > 1 ? (
                    <div className="mt-3 grid grid-cols-5 gap-2">
                        {images.map((image, index) => {
                            const thumbUrl = normalizeProductImageUrl(productImagePathForContext(image, "thumb"));
                            const isActive = image.id === (mainImage?.id ?? null);

                            return (
                                <button
                                    key={image.id}
                                    type="button"
                                    onClick={() => setSelectedImageId(image.id)}
                                    className={`relative aspect-square overflow-hidden rounded-xl border ${isActive ? "border-admin-primary ring-1 ring-admin-primary/20" : "border-admin-border"}`}
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
                                                productImagePathForContext(image, "thumb"),
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
                                                        alt={
                                                            image.alt?.trim() ||
                                                            `${productDisplayName(product)} — фото ${index + 1}`
                                                        }
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
        </>
    );
}
