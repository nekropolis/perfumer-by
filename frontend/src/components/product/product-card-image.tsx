"use client";

import Image from "next/image";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";

type Props = {
    imagePath: string | null;
    secondaryImagePath?: string | null;
    alt: string;
    eager?: boolean;
};

export default function ProductCardImage({ imagePath, secondaryImagePath = null, alt, eager = false }: Props) {
    if (!imagePath) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)]">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    className="h-7 w-7 opacity-40"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 15.75l4.159-4.159a2.25 2.25 0 013.182 0l.409.409a2.25 2.25 0 003.182 0l2.659-2.659a2.25 2.25 0 013.182 0l2.727 2.727M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                    />
                </svg>
                <span className="text-[11px] text-[var(--text-secondary)] opacity-60">Нет фото</span>
            </div>
        );
    }

    const src = normalizeProductImageUrl(imagePath);
    const secondarySrc = secondaryImagePath ? normalizeProductImageUrl(secondaryImagePath) : null;

    return (
        <>
            <Image
                src={src}
                loader={productImageLoader}
                alt={alt}
                fill
                loading={eager ? "eager" : "lazy"}
                sizes="(max-width: 1024px) 50vw, 25vw"
                className={`object-contain transition-opacity duration-300 ${secondarySrc ? "group-hover:opacity-0" : ""}`}
            />
            {secondarySrc ? (
                <Image
                    src={secondarySrc}
                    loader={productImageLoader}
                    alt={`${alt} — вид 2`}
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="pointer-events-none object-contain opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
            ) : null}
        </>
    );
}
