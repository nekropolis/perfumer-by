import type { ProductListItem } from "@/types/catalog";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { productDisplayName } from "@/lib/product-display-name";

export function formatProductCardPrice(product: ProductListItem): string {
    const min = product.price_range?.min;
    const max = product.price_range?.max;

    if (!min && !max) {
        return product.is_preorder_available ? "Предзаказ" : "Цена уточняется";
    }

    const fmtMin = formatMoneyDisplay(min);
    const fmtMax = formatMoneyDisplay(max);

    if (fmtMin && fmtMax && fmtMin !== fmtMax) {
        return `${fmtMin} – ${fmtMax} BYN`;
    }

    return `${fmtMin || fmtMax} BYN`;
}

export function formatProductCardOldPrice(product: ProductListItem): string | null {
    if (!product.has_discount) {
        return null;
    }

    const min = product.old_price_range?.min;
    const max = product.old_price_range?.max;

    if (!min && !max) {
        return null;
    }

    const fmtMin = formatMoneyDisplay(min);
    const fmtMax = formatMoneyDisplay(max);

    if (fmtMin && fmtMax && fmtMin !== fmtMax) {
        return `${fmtMin} – ${fmtMax} BYN`;
    }

    return fmtMin || fmtMax;
}

export function compactVariantLabel(label: string): string {
    const match = label.match(/\d+/);
    return match ? match[0] : label;
}

export function normalizeVariantLabels(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }
    if (value && typeof value === "object") {
        return Object.values(value).filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string") {
        return value.trim() ? [value] : [];
    }
    return [];
}

export function getProductCardTitleParts(product: ProductListItem): {
    cardTitle: string;
    brandName: string;
    showBrandLine: boolean;
    productTitle: string;
} {
    const cardTitle = productDisplayName(product);
    const presetDisplayName = product.display_name?.trim();
    const brandName = product.brand?.name?.trim() ?? "";
    const showBrandLine = Boolean(brandName) && !presetDisplayName;
    const productTitle = presetDisplayName || product.name.trim() || brandName || cardTitle;

    return { cardTitle, brandName, showBrandLine, productTitle };
}
