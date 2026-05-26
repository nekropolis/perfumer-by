import type { ProductDetailData } from "@/types/catalog";
import { productDisplayName } from "@/lib/product-display-name";
import { formatBynAmountDisplay } from "@/lib/format-byn";
import { SITE_NAME } from "@/lib/seo";
import { stripHtml, truncateByWords } from "@/lib/seo-text";

export function buildProductMetaTitle(product: ProductDetailData): string {
    if (product.seo_title?.trim()) {
        return product.seo_title.trim();
    }
    const titleName = productDisplayName(product);
    const price = product.price_range?.min ? formatBynAmountDisplay(product.price_range.min) : "";
    if (price) {
        return `${titleName} купить в Минске и Беларуси — цена ${price} BYN | ${SITE_NAME}`;
    }
    return `${titleName} купить в Минске и Беларуси | ${SITE_NAME}`;
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

    const priceFrom = product.price_range?.min
        ? `Цена от ${formatBynAmountDisplay(product.price_range.min)} BYN.`
        : "";

    const display = productDisplayName(product);
    const lead = product.brand?.name?.trim()
        ? `${display} — аромат ${product.brand.name}.`
        : `${display}.`;

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
        description || `Купить ${productDisplayName(product)} с доставкой по Беларуси.`,
        160,
    );
}

export function primaryProductImageAlt(product: ProductDetailData): string {
    const imgs = product.images ?? [];
    if (!imgs.length) return productDisplayName(product);
    const sorted = [...imgs].sort((a, b) => {
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return sorted[0]?.alt?.trim() || productDisplayName(product);
}
