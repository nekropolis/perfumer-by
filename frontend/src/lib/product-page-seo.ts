import type { ProductDetailData } from "@/types/catalog";
import { productDisplayName } from "@/lib/product-display-name";
import { formatBynAmountDisplay } from "@/lib/format-byn";
import { stripHtml, truncateByWords } from "@/lib/seo-text";

export const PRODUCT_META_TITLE_MAX_LENGTH = 60;

export type ProductMetaTitleInput = {
    name: string;
    brand?: { name: string } | null;
    display_name?: string | null;
    seo_title?: string | null;
    price_range?: { min: string | null } | null;
};

export function hasManualProductSeoTitle(
    seoTitle: string | null | undefined,
    displayName: string,
): boolean {
    const trimmed = seoTitle?.trim() ?? "";
    return trimmed !== "" && trimmed !== displayName;
}

/** Авто-title без учёта ручного override в БД. */
export function buildAutomaticProductMetaTitle(
    displayName: string,
    priceMin?: string | null,
): string {
    const name = displayName.trim();
    const price = priceMin ? formatBynAmountDisplay(priceMin) : "";

    const withPrice = price
        ? `${name} купить в Минске и Беларуси — цена ${price} BYN`
        : null;
    if (withPrice && withPrice.length <= PRODUCT_META_TITLE_MAX_LENGTH) {
        return withPrice;
    }

    const candidates = [
        `${name} купить в Минске и Беларуси`,
        `${name} купить в Минске`,
        `${name} купить`,
        name,
    ];

    for (const candidate of candidates) {
        if (candidate.length <= PRODUCT_META_TITLE_MAX_LENGTH) {
            return candidate;
        }
    }

    return name.slice(0, PRODUCT_META_TITLE_MAX_LENGTH);
}

export function buildProductMetaTitle(product: ProductMetaTitleInput): string {
    const titleName = productDisplayName(product);
    if (hasManualProductSeoTitle(product.seo_title, titleName)) {
        return (product.seo_title as string).trim();
    }

    return buildAutomaticProductMetaTitle(titleName, product.price_range?.min);
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

    const concentrations = [
        ...new Set(
            (product.variants ?? [])
                .map((v) => {
                    if (v.type?.trim()) return v.type.trim();
                    if (v.concentration?.trim()) return v.concentration.trim().toUpperCase();
                    return "";
                })
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

    const variantsLine = volumes.length
        ? `В наличии варианты: ${volumes.join(", ")}${
              concentrations.length ? ` (${concentrations.join(", ")})` : ""
          }.`
        : concentrations.length
          ? `В наличии: ${concentrations.join(", ")}.`
          : "";

    const description = [
        lead,
        priceFrom,
        variantsLine,
        "Купить в Минске и с доставкой по Беларуси.",
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
