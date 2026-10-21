"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductVariantReplacementData } from "@/types/catalog";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { siteBtnPrimary, siteCard } from "@/lib/site-ui-classes";

type Props = {
    replacement: ProductVariantReplacementData;
};

export default function ProductDiscontinuedReplacement({ replacement }: Props) {
    const href = `/${replacement.product_slug}`;
    const imageSrc = replacement.image ? normalizeProductImageUrl(replacement.image) : null;
    const title = replacement.display_name || replacement.product_name;

    return (
        <div
            className={`${siteCard} overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-stone-50 p-4 sm:p-5`}
            role="status"
        >
            <div className="mb-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800/80">
                    Снят с производства
                </p>
                <h2 className="text-lg font-semibold leading-snug text-admin-text sm:text-xl">
                    Есть замечательная замена
                </h2>
                <p className="text-sm leading-6 text-admin-text-secondary">
                    Этот объём больше не выпускают, но мы подобрали близкий аромат — посмотрите карточку
                    ниже.
                </p>
            </div>

            <Link
                href={href}
                className="group flex flex-col gap-4 rounded-2xl border border-admin-border bg-white/90 p-3 shadow-sm transition hover:border-admin-border-strong hover:shadow-md sm:flex-row sm:items-center sm:p-4"
            >
                <div className="relative mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-admin-muted sm:mx-0 sm:h-24 sm:w-24">
                    {imageSrc ? (
                        <Image
                            src={imageSrc}
                            alt={title}
                            fill
                            sizes="112px"
                            loader={productImageLoader}
                            className="object-contain p-1.5 transition duration-300 group-hover:scale-[1.03]"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-admin-text-secondary">
                            Нет фото
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                    <div className="truncate text-base font-semibold text-admin-text group-hover:text-admin-primary">
                        {title}
                    </div>
                    {replacement.variant_title ? (
                        <div className="mt-0.5 text-sm text-admin-text-secondary">
                            {replacement.variant_title}
                        </div>
                    ) : null}
                    <div className="mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-admin-primary sm:justify-start">
                        Смотреть замену
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </div>
                </div>

                <span className={`${siteBtnPrimary} hidden shrink-0 sm:inline-flex`}>
                    Перейти
                </span>
            </Link>
        </div>
    );
}
