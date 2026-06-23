"use client";

import { useState } from "react";
import type { ProductVariantSupplierItem } from "@/lib/admin-products-api";
import VariantPromotionToggle from "@/components/admin/products/variant-promotion-toggle";
import VariantSuppliersTableRows from "@/components/admin/products/variant-suppliers-table-rows";

export const SUPPLIER_TABLE_HEAD = (
    <thead className="bg-admin-muted text-left text-xs uppercase tracking-wide text-admin-text-secondary">
        <tr>
            <th className="px-3 py-2">Поставщик</th>
            <th className="px-3 py-2">Код</th>
            <th className="px-3 py-2">Название у поставщика</th>
            <th className="px-3 py-2">Закуп. цена</th>
            <th className="px-3 py-2">Кол-во</th>
        </tr>
    </thead>
);

type FlatTableOptions = {
    productId: number;
    onPromotionUpdatedAction?: (variantId: number, next: boolean) => void;
    onPromotionErrorAction?: (message: string) => void;
    getVariantPriceInputValue?: (variant: ProductVariantSupplierItem) => string;
    onVariantPriceChange?: (variantId: number, value: string) => void;
    onVariantPriceBlur?: (variant: ProductVariantSupplierItem) => void;
    variantPriceSavingId?: number | null;
};

type Props = {
    variants: ProductVariantSupplierItem[];
    highlightVariantId?: number | null;
    flatTableOptions?: FlatTableOptions;
};

function formatSitePrice(value: ProductVariantSupplierItem["site_price"]): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    return String(value).trim();
}

function AvailabilityBadge({ variant }: { variant: ProductVariantSupplierItem }) {
    if (variant.is_preorder) {
        return (
            <span
                className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                title={variant.fulfillment_tooltip || undefined}
            >
                Под заказ
            </span>
        );
    }

    if (variant.fulfillment_tooltip) {
        return (
            <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    variant.is_available
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-gray-100 text-admin-text-secondary"
                }`}
                title={variant.fulfillment_tooltip}
            >
                {variant.is_available ? "В наличии" : "Нет в наличии"}
            </span>
        );
    }

    return <span className="text-admin-text-secondary">—</span>;
}

function isVariantOutOfStock(variant: ProductVariantSupplierItem): boolean {
    return !variant.is_preorder && Boolean(variant.fulfillment_tooltip) && !variant.is_available;
}

function VariantPriceCell({
    variant,
    flatTableOptions,
}: {
    variant: ProductVariantSupplierItem;
    flatTableOptions?: FlatTableOptions;
}) {
    const sitePrice = formatSitePrice(variant.site_price);
    const editable =
        flatTableOptions?.getVariantPriceInputValue &&
        flatTableOptions.onVariantPriceChange &&
        flatTableOptions.onVariantPriceBlur;

    if (!editable) {
        return (
            <span className="inline-flex items-center gap-1 tabular-nums">
                <span>{sitePrice ?? "—"}</span>
                {sitePrice ? <span className="text-admin-text-secondary">BYN</span> : null}
            </span>
        );
    }

    const saving = flatTableOptions.variantPriceSavingId === variant.id;

    return (
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            <input
                type="text"
                inputMode="decimal"
                value={flatTableOptions.getVariantPriceInputValue!(variant)}
                onChange={(e) => flatTableOptions.onVariantPriceChange!(variant.id, e.target.value)}
                onBlur={() => flatTableOptions.onVariantPriceBlur!(variant)}
                disabled={saving}
                placeholder="—"
                className="w-24 rounded border border-emerald-200 bg-white px-2 py-0.5 text-xs tabular-nums text-emerald-700 outline-none focus:border-emerald-300"
            />
            <span>{saving ? "…" : "BYN"}</span>
        </span>
    );
}

export default function ProductVariantSuppliersFlatTable({
    variants,
    highlightVariantId,
    flatTableOptions,
}: Props) {
    const [expandedVariantId, setExpandedVariantId] = useState<number | null>(null);

    if (variants.length === 0) {
        return (
            <div className="rounded-xl border px-3 py-4 text-sm text-admin-text-secondary">
                Нет данных по вариантам или привязкам.
            </div>
        );
    }

    const toggleExpanded = (variant: ProductVariantSupplierItem) => {
        if (isVariantOutOfStock(variant)) {
            return;
        }

        setExpandedVariantId((prev) => (prev === variant.id ? null : variant.id));
    };

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted text-left text-xs uppercase tracking-wide text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2.5">Код</th>
                        <th className="px-3 py-2.5">Наличие</th>
                        <th className="px-3 py-2.5">Акция</th>
                        <th className="px-3 py-2.5">Вариант</th>
                        <th className="px-3 py-2.5 text-right">Цена</th>
                    </tr>
                </thead>
                <tbody>
                    {variants.map((variant) => {
                        const highlighted =
                            highlightVariantId != null && highlightVariantId === variant.id;
                        const expanded = expandedVariantId === variant.id;

                        return (
                            <VariantFlatTableRows
                                key={variant.id}
                                variant={variant}
                                highlighted={highlighted}
                                expanded={expanded}
                                onToggleSuppliersAction={() => toggleExpanded(variant)}
                                flatTableOptions={flatTableOptions}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function VariantFlatTableRows({
    variant,
    highlighted,
    expanded,
    onToggleSuppliersAction,
    flatTableOptions,
}: {
    variant: ProductVariantSupplierItem;
    highlighted: boolean;
    expanded: boolean;
    onToggleSuppliersAction: () => void;
    flatTableOptions?: FlatTableOptions;
}) {
    const rowClass = highlighted ? "bg-blue-50/50" : "bg-white";
    const outOfStock = isVariantOutOfStock(variant);

    return (
        <>
            <tr className={`border-t ${rowClass}`}>
                <td className="px-3 py-2 tabular-nums text-admin-text-secondary">{variant.id}</td>
                <td className="px-3 py-2">
                    <AvailabilityBadge variant={variant} />
                </td>
                <td className="px-3 py-2">
                    {flatTableOptions?.productId ? (
                        <VariantPromotionToggle
                            productId={flatTableOptions.productId}
                            variantId={variant.id}
                            checked={Boolean(variant.is_promotion)}
                            onUpdatedAction={(next) =>
                                flatTableOptions.onPromotionUpdatedAction?.(variant.id, next)
                            }
                            onErrorAction={flatTableOptions.onPromotionErrorAction}
                        />
                    ) : variant.is_promotion ? (
                        <span className="text-xs text-admin-text-secondary">Да</span>
                    ) : (
                        <span className="text-xs text-admin-text-secondary">—</span>
                    )}
                </td>
                <td className="px-3 py-2">
                    {outOfStock ? (
                        <span className="block truncate text-sm font-medium text-admin-text">
                            {variant.title || "—"}
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={onToggleSuppliersAction}
                            className={`inline-block max-w-full origin-left text-left text-sm underline decoration-admin-primary/40 underline-offset-2 transition-[transform,text-decoration-color] duration-150 ease-out hover:scale-105 hover:decoration-admin-primary ${
                                expanded ? "font-bold text-admin-text" : "font-medium text-admin-text"
                            }`}
                            aria-expanded={expanded}
                            title="Поставщики и склады"
                        >
                            <span className="block truncate">{variant.title || "—"}</span>
                        </button>
                    )}
                </td>
                <td className="px-3 py-2 text-right">
                    <VariantPriceCell variant={variant} flatTableOptions={flatTableOptions} />
                </td>
            </tr>
            {expanded && !outOfStock ? (
                <tr className={`border-t ${rowClass}`}>
                    <td colSpan={5} className="px-3 py-2">
                        <SupplierDetailsPanel variant={variant} />
                    </td>
                </tr>
            ) : null}
        </>
    );
}

function SupplierDetailsPanel({ variant }: { variant: ProductVariantSupplierItem }) {
    return (
        <div className="overflow-x-auto rounded-lg border bg-admin-muted/30">
            <table className="min-w-full text-xs">
                {SUPPLIER_TABLE_HEAD}
                <tbody>
                    <VariantSuppliersTableRows variant={variant} cellClassName="px-3 py-2" />
                </tbody>
            </table>
        </div>
    );
}
