import type { ReactNode } from "react";
import type { ProductVariantSupplierItem } from "@/lib/admin-products-api";

function formatSitePrice(value: ProductVariantSupplierItem["site_price"]): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    return String(value).trim();
}

type Props = {
    variant: ProductVariantSupplierItem;
    highlightVariantId?: number | null;
    /** Замена блока цены (редактирование на странице продуктов). */
    priceSlot?: ReactNode;
};

export function formatProductSuppliersModalTitle(
    productId: number,
    productName: string,
    brandName?: string | null,
): string {
    const name = productName.trim();
    const brand = brandName?.trim();

    if (brand) {
        return `${productId} - ${brand} ${name}`;
    }

    return `${productId} - ${name}`;
}

export default function VariantSuppliersSummaryRow({
    variant,
    highlightVariantId,
    priceSlot,
}: Props) {
    const highlighted = highlightVariantId != null && highlightVariantId === variant.id;
    const sitePrice = formatSitePrice(variant.site_price);

    return (
        <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-admin-text ${
                highlighted ? "rounded-md bg-blue-50/70 px-1 py-0.5" : ""
            }`}
        >
            <span className="shrink-0 tabular-nums text-admin-text-secondary">{variant.id}</span>
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    variant.is_active !== false
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-admin-text-secondary"
                }`}
            >
                {variant.is_active !== false ? "Активен" : "Выкл"}
            </span>
            {variant.is_preorder ? (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    Предзаказ
                </span>
            ) : null}
            {variant.fulfillment_tooltip ? (
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        variant.is_available
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-gray-100 text-admin-text-secondary"
                    }`}
                    title={variant.fulfillment_tooltip}
                >
                    {variant.is_available ? "В наличии" : "Нет в наличии"}
                </span>
            ) : null}
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{variant.title || "—"}</span>
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            {priceSlot ?? (
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-admin-text">
                    <span>{sitePrice ?? "—"}</span>
                    <span className="text-admin-text-secondary">BYN</span>
                </span>
            )}
        </div>
    );
}
