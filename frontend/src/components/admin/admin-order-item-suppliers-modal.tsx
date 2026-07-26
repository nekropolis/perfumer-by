"use client";

import { useEffect } from "react";
import type { OrderItem } from "@/types/orders";
import CopyText from "@/components/ui/copy-text";
import { lineItemFullTitle } from "@/lib/product-display-name";

type Props = {
    item: OrderItem | null;
    onCloseAction: () => void;
};

export default function AdminOrderItemSuppliersModal({ item, onCloseAction }: Props) {
    useEffect(() => {
        if (!item) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCloseAction();
            }
        };

        document.addEventListener("keydown", handleEsc);
        return () => document.removeEventListener("keydown", handleEsc);
    }, [item, onCloseAction]);

    if (!item) {
        return null;
    }

    const offers = item.supplier_offers ?? [];
    const receiptBatches = item.receipt_batches ?? [];
    const combinedRows = [
        ...offers.map((offer) => ({
            source: "Оффер",
            supplierName: offer.supplier_name || offer.supplier_code || `#${offer.supplier_id}`,
            code: offer.external_id || offer.sku || "—",
            title: offer.external_variant_name || offer.external_product_name || "—",
            purchasePrice: offer.purchase_price ?? "—",
            warehouseName: "—",
            qtyText: String(offer.stock),
            status: !offer.is_active
                ? "Отключен"
                : offer.is_preorder
                    ? "Предзаказ"
                    : offer.stock > 0
                        ? "В наличии"
                        : "Нет в наличии",
            externalUrl: offer.external_product_url || null,
            key: `offer-${offer.id}`,
        })),
        ...receiptBatches.map((batch) => ({
            source: "Приход",
            supplierName: batch.supplier_name || "Магазин",
            code: batch.supplier_code || (batch.receipt_document_no ? `#${batch.receipt_document_no}` : `#${batch.receipt_id}`),
            title: batch.supplier_product_name || "—",
            purchasePrice: batch.supplier_price ?? "—",
            warehouseName: batch.warehouse_name || "—",
            qtyText: `${batch.qty} шт.`,
            status: batch.received_at ? `Принят ${batch.received_at}` : "Принят",
            externalUrl: null,
            key: `receipt-batch-${batch.receipt_item_id}`,
        })),
    ];

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-order-item-suppliers-title"
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3
                            id="admin-order-item-suppliers-title"
                            className="text-xl font-semibold"
                        >
                            Поставщики товара
                        </h3>
                        <div className="mt-1 text-sm text-admin-text-secondary">
                            {lineItemFullTitle(item)}
                        </div>
                        {item.variant_id != null && (
                            <div className="mt-0.5 text-xs text-admin-text-secondary">
                                Вариант #{item.variant_id}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-lg"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                {item.variant_id == null ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-admin-text-secondary">
                        Позиция не привязана к варианту каталога, поэтому поставщики недоступны.
                    </div>
                ) : combinedRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-admin-text-secondary">
                        Для этого варианта нет привязанных поставщиков.
                    </div>
                ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-2xl border">
                        <table className="w-full text-sm">
                            <thead className="bg-admin-muted text-xs uppercase tracking-wide text-admin-text-secondary">
                                <tr>
                                    <th className="px-3 py-2 text-left">Источник</th>
                                    <th className="px-3 py-2 text-left">Поставщик</th>
                                    <th className="px-3 py-2 text-left">Код</th>
                                    <th className="px-3 py-2 text-left">Название</th>
                                    <th className="px-3 py-2 text-right">Закуп</th>
                                    <th className="px-3 py-2 text-left">Склад</th>
                                    <th className="px-3 py-2 text-right">Кол-во</th>
                                    <th className="px-3 py-2 text-left">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {combinedRows.map((row) => {
                                    return (
                                        <tr key={row.key} className="align-top">
                                            <td className="px-3 py-2">
                                                <span className="rounded-full border px-2 py-0.5 text-xs">
                                                    {row.source}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                {row.externalUrl ? (
                                                    <a
                                                        href={row.externalUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="underline decoration-gray-400 underline-offset-2 hover:text-admin-text"
                                                    >
                                                        {row.supplierName}
                                                    </a>
                                                ) : (
                                                    <span>{row.supplierName}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-admin-text">
                                                {row.code === "—" ? (
                                                    "—"
                                                ) : (
                                                    <CopyText
                                                        value={row.code}
                                                        title="Скопировать код поставщика"
                                                        iconSize={12}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-3 py-2">{row.title}</td>
                                            <td className="px-3 py-2 text-right">{row.purchasePrice}</td>
                                            <td className="px-3 py-2">{row.warehouseName}</td>
                                            <td className="px-3 py-2 text-right">{row.qtyText}</td>
                                            <td className="px-3 py-2 text-admin-text-secondary">{row.status}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
