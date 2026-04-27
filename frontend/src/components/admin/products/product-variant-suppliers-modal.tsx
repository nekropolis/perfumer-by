"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import {
    fetchProductVariantSuppliers,
    type ProductVariantSupplierItem,
} from "@/lib/admin-products-api";
import VariantSuppliersTableRows from "@/components/admin/products/variant-suppliers-table-rows";

function defaultVariantToolbarRow(
    variant: ProductVariantSupplierItem,
    highlightVariantId?: number | null,
): ReactNode {
    const highlighted = highlightVariantId != null && highlightVariantId === variant.id;
    return (
        <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-900 ${
                highlighted ? "rounded-md bg-blue-50/70 px-1 py-0.5" : ""
            }`}
        >
            <span className="shrink-0 tabular-nums text-gray-500">{variant.id}</span>
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    variant.is_active !== false ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                }`}
            >
                {variant.is_active !== false ? "Активен" : "Выкл"}
            </span>
            {variant.is_preorder ? (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    Предзаказ
                </span>
            ) : null}
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{variant.title || "—"}</span>
            <span className="shrink-0 text-gray-300" aria-hidden>
                ·
            </span>
            <span className="shrink-0 tabular-nums text-gray-700">{variant.stock}</span>
        </div>
    );
}

export type ProductVariantSuppliersModalProps = {
    open: boolean;
    onCloseAction: () => void;
    productId: number;
    /** Заголовок модалки (обычно название товара). */
    productTitle: string;
    /** Подзаголовок под названием (опционально). */
    subtitle?: string;
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
};

export function ProductVariantSuppliersGroupedTable({
    variants,
    highlightVariantId,
    cellClassName,
    renderVariantToolbarAction,
}: {
    variants: ProductVariantSupplierItem[];
    highlightVariantId?: number | null;
    cellClassName: string;
    renderVariantToolbarAction?: (variant: ProductVariantSupplierItem) => ReactNode;
}) {
    const toolbarForVariant =
        renderVariantToolbarAction ??
        ((v: ProductVariantSupplierItem) => defaultVariantToolbarRow(v, highlightVariantId));

    if (variants.length === 0) {
        return (
            <div className="rounded-xl border px-3 py-4 text-sm text-gray-500">
                Нет данных по вариантам или привязкам.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className={cellClassName}>Поставщик</th>
                        <th className={cellClassName}>Код</th>
                        <th className={cellClassName}>Название у поставщика</th>
                        <th className={cellClassName}>Закуп. цена</th>
                        <th className={cellClassName}>Склад</th>
                        <th className={cellClassName}>Кол-во</th>
                    </tr>
                </thead>
                <tbody>
                    {variants.map((variant) => (
                        <Fragment key={variant.id}>
                            <tr className="border-t bg-gray-50/80">
                                <td colSpan={6} className={`${cellClassName} py-2`}>
                                    {toolbarForVariant(variant)}
                                </td>
                            </tr>
                            <VariantSuppliersTableRows variant={variant} cellClassName={cellClassName} />
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function ProductVariantSuppliersModal({
    open,
    onCloseAction,
    productId,
    productTitle,
    subtitle,
    highlightVariantId,
    singleVariantId,
    renderVariantToolbarAction,
    suppliers: suppliersFromParent,
    suppliersLoading: suppliersLoadingFromParent,
    suppliersError: suppliersErrorFromParent,
}: ProductVariantSuppliersModalProps) {
    const [items, setItems] = useState<ProductVariantSupplierItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const useExternalSuppliers = suppliersFromParent !== undefined;

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
        <div className="fixed inset-0 z-[200] bg-black/40 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
                        <div className="min-w-0 pr-3">
                            <h2 className="truncate text-xl font-semibold">{productTitle}</h2>
                            {subtitle ? (
                                <p className="mt-1 truncate text-sm text-gray-500">{subtitle}</p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => onCloseAction()}
                            className="shrink-0 rounded-xl border px-3 py-1.5 text-sm"
                        >
                            Закрыть
                        </button>
                    </div>

                    <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-500">Загрузка привязок поставщиков...</div>
                        ) : error ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : (
                            <ProductVariantSuppliersGroupedTable
                                variants={items}
                                highlightVariantId={highlightVariantId}
                                cellClassName="px-3 py-2"
                                renderVariantToolbarAction={renderVariantToolbarAction}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
