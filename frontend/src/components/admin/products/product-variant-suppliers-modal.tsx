"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
    fetchProductVariantSuppliers,
    type ProductVariantSupplierItem,
} from "@/lib/admin-products-api";
import VariantSuppliersTableRows from "@/components/admin/products/variant-suppliers-table-rows";
import VariantSuppliersSummaryRow, {
    formatProductSuppliersModalTitle,
} from "@/components/admin/products/variant-suppliers-summary-row";
import ProductVariantSuppliersFlatTable, {
    SUPPLIER_TABLE_HEAD,
} from "@/components/admin/products/product-variant-suppliers-flat-table";

export type ProductVariantSuppliersModalProps = {
    open: boolean;
    onCloseAction: () => void;
    productId: number;
    productName: string;
    productBrandName?: string | null;
    /** Подсветить блок варианта (например открыли из строки варианта). */
    highlightVariantId?: number | null;
    /**
     * При внутренней загрузке (без `suppliers` с родителя): запрос только этого варианта (`?variant_id=`).
     */
    singleVariantId?: number | null;
    /** Доп. строка над таблицей привязок конкретного варианта (цена на странице продуктов и т.п.). */
    renderVariantToolbarAction?: (variant: ProductVariantSupplierItem) => ReactNode;
    /**
     * Если задано — данные не запрашиваются внутри модалки (родитель сам загрузил).
     * Если не задано — при открытии вызывается fetchProductVariantSuppliers(productId [, { variantId }]).
     */
    suppliers?: ProductVariantSupplierItem[] | null;
    suppliersLoading?: boolean;
    suppliersError?: string;
    layout?: "grouped" | "flat";
    flatTableOptions?: {
        productId: number;
        onPromotionUpdatedAction?: (variantId: number, next: boolean) => void;
        onPromotionErrorAction?: (message: string) => void;
        getVariantPriceInputValue?: (variant: ProductVariantSupplierItem) => string;
        onVariantPriceChange?: (variantId: number, value: string) => void;
        onVariantPriceBlur?: (variant: ProductVariantSupplierItem) => void;
        variantPriceSavingId?: number | null;
    };
};

export function ProductVariantSuppliersGroupedTable({
    variants,
    highlightVariantId,
    cellClassName = "px-3 py-2",
    renderVariantToolbarAction,
}: {
    variants: ProductVariantSupplierItem[];
    highlightVariantId?: number | null;
    cellClassName?: string;
    renderVariantToolbarAction?: (variant: ProductVariantSupplierItem) => ReactNode;
}) {
    if (variants.length === 0) {
        return (
            <div className="rounded-xl border px-3 py-4 text-sm text-admin-text-secondary">
                Нет данных по вариантам или привязкам.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {variants.map((variant) => (
                <section key={variant.id} className="overflow-hidden rounded-xl border">
                    <div className="border-b bg-admin-muted/80 px-3 py-2">
                        {renderVariantToolbarAction ? (
                            renderVariantToolbarAction(variant)
                        ) : (
                            <VariantSuppliersSummaryRow
                                variant={variant}
                                highlightVariantId={highlightVariantId}
                            />
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            {SUPPLIER_TABLE_HEAD}
                            <tbody>
                                <VariantSuppliersTableRows variant={variant} cellClassName={cellClassName} />
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    );
}

export default function ProductVariantSuppliersModal({
    open,
    onCloseAction,
    productId,
    productName,
    productBrandName,
    highlightVariantId,
    singleVariantId,
    renderVariantToolbarAction,
    suppliers: suppliersFromParent,
    suppliersLoading: suppliersLoadingFromParent,
    suppliersError: suppliersErrorFromParent,
    layout = "grouped",
    flatTableOptions,
}: ProductVariantSuppliersModalProps) {
    const [items, setItems] = useState<ProductVariantSupplierItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const useExternalSuppliers = suppliersFromParent !== undefined;
    const modalTitle = formatProductSuppliersModalTitle(productId, productName, productBrandName);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetchProductVariantSuppliers(
                productId,
                singleVariantId != null && singleVariantId > 0 ? { variantId: singleVariantId } : undefined,
            );
            setItems(res.data ?? []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить привязки");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [productId, singleVariantId]);

    useEffect(() => {
        if (!open) {
            return;
        }
        if (useExternalSuppliers) {
            setItems(suppliersFromParent ?? []);
            setLoading(Boolean(suppliersLoadingFromParent));
            setError(suppliersErrorFromParent ?? "");
            return;
        }
        void load();
    }, [
        open,
        load,
        useExternalSuppliers,
        suppliersFromParent,
        suppliersLoadingFromParent,
        suppliersErrorFromParent,
    ]);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
                        <h2 className="min-w-0 truncate pr-3 text-xl font-semibold">{modalTitle}</h2>
                        <button
                            type="button"
                            onClick={() => onCloseAction()}
                            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm"
                        >
                            Закрыть
                        </button>
                    </div>

                    <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
                        {loading ? (
                            <div className="text-sm text-admin-text-secondary">Загрузка привязок поставщиков...</div>
                        ) : error ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : layout === "flat" ? (
                            <ProductVariantSuppliersFlatTable
                                variants={items}
                                highlightVariantId={highlightVariantId}
                                flatTableOptions={flatTableOptions}
                            />
                        ) : (
                            <ProductVariantSuppliersGroupedTable
                                variants={items}
                                highlightVariantId={highlightVariantId}
                                renderVariantToolbarAction={renderVariantToolbarAction}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
