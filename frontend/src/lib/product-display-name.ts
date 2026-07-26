import { slugify } from "@/lib/slugify";

type ProductNameParts = {
    name: string;
    brand?: { name: string } | null;
    display_name?: string | null;
};

export function productDisplayName(product: ProductNameParts): string {
    const preset = product.display_name?.trim();
    if (preset) {
        return preset;
    }

    const brand = product.brand?.name?.trim() ?? "";
    const name = product.name.trim();

    if (!brand) {
        return name;
    }

    if (!name) {
        return brand;
    }

    return `${brand} ${name}`;
}

/** Корзина, чекаут, заказы: одна строка «бренд + название» без дубля. */
export function lineItemProductTitle(item: {
    product_name?: string | null;
    brand_name?: string | null;
    product_display_name?: string | null;
}): string {
    const preset = item.product_display_name?.trim();
    if (preset) {
        return preset;
    }

    const name = (item.product_name ?? "").trim();
    const brand = (item.brand_name ?? "").trim();

    if (!brand) {
        return name;
    }

    if (!name) {
        return brand;
    }

    const lowerName = name.toLocaleLowerCase("ru");
    const lowerBrand = brand.toLocaleLowerCase("ru");
    if (lowerName === lowerBrand || lowerName.startsWith(`${lowerBrand} `)) {
        return name;
    }

    return `${brand} ${name}`;
}

/** Заказы / админка: «бренд + название — вариант» одной строкой. */
export function lineItemFullTitle(
    item: {
        product_name?: string | null;
        brand_name?: string | null;
        product_display_name?: string | null;
        variant_title?: string | null;
    },
    fallback = "Товар",
): string {
    const title = lineItemProductTitle(item).trim() || fallback;
    const variant = (item.variant_title ?? "").trim();
    if (!variant) {
        return title;
    }

    const lowerTitle = title.toLocaleLowerCase("ru");
    const lowerVariant = variant.toLocaleLowerCase("ru");
    if (
        lowerTitle === lowerVariant
        || lowerTitle.endsWith(` ${lowerVariant}`)
        || lowerTitle.endsWith(`— ${lowerVariant}`)
        || lowerTitle.endsWith(`- ${lowerVariant}`)
    ) {
        return title;
    }

    return `${title} — ${variant}`;
}

export function headerSearchProductTitle(item: {
    name: string;
    display_name?: string | null;
    brand_name?: string | null;
}): string {
    const preset = item.display_name?.trim();
    if (preset) {
        return preset;
    }

    return lineItemProductTitle({
        product_name: item.name,
        brand_name: item.brand_name,
    });
}

export function buildProductSlug(brandSlug: string, productName: string): string {
    const brandPart = slugify(brandSlug);
    const productPart = slugify(productName);

    if (!brandPart) {
        return productPart;
    }

    if (!productPart) {
        return brandPart;
    }

    return `${brandPart}-${productPart}`;
}
