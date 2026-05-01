import type { ProductDetailData } from "@/types/catalog";

export type BreadcrumbNavItem = {
    label: string;
    href?: string;
};

export function getProductBreadcrumbItems(product: ProductDetailData): BreadcrumbNavItem[] {
    return [
        { label: "Главная", href: "/" },
        { label: "Каталог", href: "/catalog" },
        ...(product.brand
            ? [{ label: product.brand.name, href: `/brands/${product.brand.slug}` } satisfies BreadcrumbNavItem]
            : []),
        { label: product.name, href: `/product/${product.slug}` },
    ];
}
