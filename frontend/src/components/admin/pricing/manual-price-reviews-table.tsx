"use client";

import { useState } from "react";
import type { ManualPriceReviewItem } from "@/lib/admin-pricing-api";

const REASON_LABELS: Record<ManualPriceReviewItem["reason"], string> = {
    no_receipt_supplier: "Нет поставщика в приходе",
    no_supplier_match: "Нет в прайсе поставщика",
    warehouse_not_lower: "Вход склад ≥ прайс",
};

type RowState = {
    price: string;
    listOnStorefront: boolean;
};

type Props = {
    items: ManualPriceReviewItem[];
    savingId: number | null;
    onSaveAction: (item: ManualPriceReviewItem, state: RowState) => Promise<void>;
};

export default function ManualPriceReviewsTable({ items, savingId, onSaveAction }: Props) {
    const [rowState, setRowState] = useState<Record<number, RowState>>(() => {
        const initial: Record<number, RowState> = {};
        for (const item of items) {
            initial[item.id] = {
                price: item.manual_retail_price != null ? String(item.manual_retail_price) : "",
                listOnStorefront: item.list_on_storefront,
            };
        }
        return initial;
    });

    const getState = (item: ManualPriceReviewItem): RowState =>
        rowState[item.id] ?? {
            price: item.manual_retail_price != null ? String(item.manual_retail_price) : "",
            listOnStorefront: item.list_on_storefront,
        };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2.5">Активный</th>
                        <th className="px-3 py-2.5">Товар</th>
                        <th className="px-3 py-2.5">Причина</th>
                        <th className="px-3 py-2.5">Вход склад</th>
                        <th className="px-3 py-2.5">Вход поставщик</th>
                        <th className="px-3 py-2.5">Код</th>
                        <th className="px-3 py-2.5">Розница</th>
                        <th className="px-3 py-2.5 text-right">Действие</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        const state = getState(item);
                        const code = item.supplier_external_code || item.supplier_sku || "—";

                        return (
                            <tr
                                key={item.id}
                                className="border-t border-admin-border align-top transition hover:bg-admin-muted/70"
                            >
                                <td className="px-3 py-3">
                                    <input
                                        type="checkbox"
                                        checked={state.listOnStorefront}
                                        onChange={(e) =>
                                            setRowState((prev) => ({
                                                ...prev,
                                                [item.id]: {
                                                    ...state,
                                                    listOnStorefront: e.target.checked,
                                                },
                                            }))
                                        }
                                    />
                                </td>
                                <td className="px-3 py-3">
                                    <div className="font-medium text-admin-text">{item.product_name}</div>
                                    <div className="text-xs text-admin-text-secondary">{item.variant_title}</div>
                                </td>
                                <td className="px-3 py-3 text-admin-text-secondary">
                                    {REASON_LABELS[item.reason]}
                                </td>
                                <td className="px-3 py-3 text-admin-text">{item.warehouse_purchase}</td>
                                <td className="px-3 py-3 text-admin-text">{item.supplier_purchase ?? "—"}</td>
                                <td className="px-3 py-3 text-admin-text-secondary">{code}</td>
                                <td className="px-3 py-3">
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={state.price}
                                        onChange={(e) =>
                                            setRowState((prev) => ({
                                                ...prev,
                                                [item.id]: { ...state, price: e.target.value },
                                            }))
                                        }
                                        className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                                    />
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <button
                                        type="button"
                                        disabled={savingId === item.id || state.price.trim() === ""}
                                        onClick={() => void onSaveAction(item, state)}
                                        className="rounded-lg border border-admin-border px-3 py-1.5 text-sm hover:bg-admin-muted disabled:opacity-50"
                                    >
                                        {savingId === item.id ? "..." : "Сохранить"}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
