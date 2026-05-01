import type { ProductDetailData } from "@/types/catalog";
import { SITE_NAME } from "@/lib/seo";
import { stripHtml, truncateByWords } from "@/lib/seo-text";

export function buildProductMetaTitle(product: ProductDetailData): string {
    if (product.seo_title?.trim()) {
        return product.seo_title.trim();
    }
    return `${product.name} купить в Минске и Беларуси, цена | ${SITE_NAME}`;
}

export function buildProductMetaDescription(product: ProductDetailData): string {
    if (product.seo_description?.trim()) {
        return truncateByWords(stripHtml(product.seo_description), 160);
    }

    if (product.short_description?.trim()) {
        return truncateByWords(stripHtml(product.short_description), 160);
    }

    const volumes = [
        ...new Set(
            (product.variants ?? [])
                .map((v) => {
                    if (v.volume == null) return "";
                    const unit = v.volume_unit?.trim() || "";
                    return unit ? `${v.volume} ${unit}` : String(v.volume);
                })
                .map((s) => s.trim())
                .filter(Boolean),
        ),
    ];

    const priceFrom = product.price_range?.min ? `Цена от ${product.price_range.min} BYN.` : "";

    const lead = product.brand?.name?.trim()
        ? `${product.name} — аромат ${product.brand.name}.`
        : `${product.name}.`;

    const description = [
        lead,
        volumes.length ? `В наличии варианты: ${volumes.join(", ")}.` : "",
        "Купить в Минске и с доставкой по Беларуси.",
        priceFrom,
    ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    return truncateByWords(
        description || `Купить ${product.name} с доставкой по Беларуси.`,
        160,
    );
}

export function primaryProductImageAlt(product: ProductDetailData): string {
    const imgs = product.images ?? [];
    if (!imgs.length) return product.name;
    const sorted = [...imgs].sort((a, b) => {
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return sorted[0]?.alt?.trim() || product.name;
}
