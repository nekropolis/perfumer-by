"use client";

import { useEffect } from "react";
import type { OrderItem } from "@/types/orders";
import CopyText from "@/components/ui/copy-text";

type Props = {
    item: OrderItem | null;
    onCloseAction: () => void;
};

export default function AdminOrderItemSuppliersModal({ item, onCloseAction }: Props) {
    useEffect(() => {
        if (!item) return;

        console.log("[AdminOrderItemSuppliersModal] mounted with item", item);

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

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
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
                        <div className="mt-1 text-sm text-gray-600">
                            {item.product_name}
                            {item.variant_title ? ` · ${item.variant_title}` : ""}
                        </div>
                        {item.variant_id != null && (
                            <div className="mt-0.5 text-xs text-gray-500">
                                Вариант #{item.variant_id}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border text-lg"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                {item.variant_id == null ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
                        Позиция не привязана к варианту каталога, поэтому поставщики недоступны.
                    </div>
                ) : offers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
                        Для этого варианта нет привязанных поставщиков.
                    </div>
                ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-2xl border">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-3 py-2 text-left">Поставщик</th>
                                    <th className="px-3 py-2 text-left">Код</th>
                                    <th className="px-3 py-2 text-right">Цена</th>
                                    <th className="px-3 py-2 text-right">Закуп</th>
                                    <th className="px-3 py-2 text-right">Остаток</th>
                                    <th className="px-3 py-2 text-left">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {offers.map((offer) => {
                                    const code = offer.external_id || offer.sku || "—";
                                    const statusLabel = !offer.is_active
                                        ? "Отключен"
                                        : offer.is_preorder
                                            ? "Предзаказ"
                                            : offer.stock > 0
                                                ? "В наличии"
                                                : "Нет в наличии";

                                    return (
                                        <tr key={offer.id} className="align-top">
                                            <td className="px-3 py-2">
                                                {offer.external_product_url ? (
                                                    <a
                                                        href={offer.external_product_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900"
                                                    >
                                                        {offer.supplier_name || offer.supplier_code || `#${offer.supplier_id}`}
                                                    </a>
                                                ) : (
                                                    <span>
                                                        {offer.supplier_name || offer.supplier_code || `#${offer.supplier_id}`}
                                                    </span>
                                                )}
                                                {offer.external_variant_name && (
                                                    <div className="mt-0.5 text-xs text-gray-500">
                                                        {offer.external_variant_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-gray-700">
                                                {code === "—" ? (
                                                    "—"
                                                ) : (
                                                    <CopyText
                                                        value={code}
                                                        title="Скопировать код поставщика"
                                                        iconSize={12}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {offer.price ?? "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-600">
                                                {offer.purchase_price ?? "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right">{offer.stock}</td>
                                            <td className="px-3 py-2 text-gray-600">{statusLabel}</td>
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
