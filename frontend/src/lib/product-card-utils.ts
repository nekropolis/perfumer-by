import type { ReactNode } from "react";
import type { ProductListItem, ProductVariantData } from "@/types/catalog";
import { withBynSign, withBynSignRange } from "@/lib/byn-sign";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { productDisplayName } from "@/lib/product-display-name";

export function compareVariantsByVolume(a: ProductVariantData, b: ProductVariantData): number {
    const volA = a.volume ?? Number.POSITIVE_INFINITY;
    const volB = b.volume ?? Number.POSITIVE_INFINITY;
    if (volA !== volB) {
        return volA - volB;
    }
    return a.id - b.id;
}

export function parseVolumeMlFromLabel(label: string): number | null {
    const match = label.match(/\d+(?:[.,]\d+)?/);
    if (!match) {
        return null;
    }
    const n = Number.parseFloat(match[0].replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

export function sortVariantLabelsByVolume(labels: string[]): string[] {
    return [...labels].sort((a, b) => {
        const volA = parseVolumeMlFromLabel(a) ?? Number.POSITIVE_INFINITY;
        const volB = parseVolumeMlFromLabel(b) ?? Number.POSITIVE_INFINITY;
        if (volA !== volB) {
            return volA - volB;
        }
        return a.localeCompare(b, "ru");
    });
}

export function formatProductCardPrice(product: ProductListItem): ReactNode {
    const min = product.price_range?.min;
    const max = product.price_range?.max;

    if (!min && !max) {
        if (product.is_preorder_available) {
            return "Предзаказ";
        }

        if (product.is_out_of_stock) {
            return "Ожидается поступление";
        }

        return "Цена уточняется";
    }

    const fmtMin = formatMoneyDisplay(min);
    const fmtMax = formatMoneyDisplay(max);

    if (fmtMin && fmtMax && fmtMin !== fmtMax) {
        return withBynSignRange(fmtMin, fmtMax);
    }

    return withBynSign(fmtMin || fmtMax || "");
}

export function formatProductCardOldPrice(product: ProductListItem): ReactNode | null {
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
        return withBynSignRange(fmtMin, fmtMax);
    }

    const single = fmtMin || fmtMax;
    return single ? withBynSign(single) : null;
}

export function compactVariantLabel(label: string): string {
    const match = label.match(/\d+(?:[.,]\d+)?/);
    if (!match) {
        return label;
    }
    const n = Number.parseFloat(match[0].replace(",", "."));
    if (!Number.isFinite(n)) {
        return label;
    }
    if (Number.isInteger(n)) {
        return String(n);
    }
    return String(n).replace(".", ",");
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

export function formatVariantChipLabel(label: string): string {
    const compact = compactVariantLabel(label);
    if (/^\d+(?:,\d+)?$/.test(compact)) {
        return `${compact} мл`;
    }
    return compact;
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
