"use client";

import { useState } from "react";
import type { ManualPriceReviewItem } from "@/lib/admin-pricing-api";

const REASON_LABELS: Record<string, string> = {
    no_receipt_supplier: "Нет поставщика",
    no_supplier_match: "Нет поставщика",
    warehouse_not_lower: "Вход склад ≥ прайс",
    warehouse_offer_gap: "Разница склад/офер >10%",
    warehouse_blend_gap: "Разница склад/офер >30%",
    allparfume_no_match: "Allparfume: нет подходящего оффера",
    allparfume_no_input: "Allparfume: нет входа",
};

type RowState = {
    warehousePurchase: string;
    price: string;
    listOnStorefront: boolean;
};

type Props = {
    items: ManualPriceReviewItem[];
    savingId: number | null;
    onSaveAction: (item: ManualPriceReviewItem, state: RowState) => Promise<void>;
    onSaveWarehousePurchaseAction: (
        item: ManualPriceReviewItem,
        warehousePurchase: string,
    ) => Promise<boolean>;
};

const numberInputClassName =
    "w-28 rounded-lg border px-2 py-1.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function defaultRowState(item: ManualPriceReviewItem): RowState {
    return {
        warehousePurchase: item.warehouse_purchase != null ? String(item.warehouse_purchase) : "",
        price: item.manual_retail_price != null ? String(item.manual_retail_price) : "",
        listOnStorefront: item.list_on_storefront,
    };
}

function sameMoney(a: string | number | null | undefined, b: string): boolean {
    const left = Number(a);
    const right = Number(b);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return String(a ?? "").trim() === b.trim();
    }
    return left === right;
}

export default function ManualPriceReviewsTable({
    items,
    savingId,
    onSaveAction,
    onSaveWarehousePurchaseAction,
}: Props) {
    const [rowState, setRowState] = useState<Record<number, RowState>>(() => {
        const initial: Record<number, RowState> = {};
        for (const item of items) {
            initial[item.id] = defaultRowState(item);
        }
        return initial;
    });

    const getState = (item: ManualPriceReviewItem): RowState =>
        rowState[item.id] ?? defaultRowState(item);

    const handleWarehouseBlur = (
        item: ManualPriceReviewItem,
        state: RowState,
        rawValue: string,
    ) => {
        const next = rawValue.trim();
        const revert = () => {
            setRowState((prev) => ({
                ...prev,
                [item.id]: {
                    ...state,
                    warehousePurchase:
                        item.warehouse_purchase != null ? String(item.warehouse_purchase) : "",
                },
            }));
        };

        if (next === "" || !Number.isFinite(Number(next)) || Number(next) < 0) {
            revert();
            return;
        }

        if (sameMoney(item.warehouse_purchase, next)) {
            return;
        }

        void (async () => {
            const ok = await onSaveWarehousePurchaseAction(item, next);
            if (!ok) {
                revert();
            }
        })();
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
                        const canSave = state.price.trim() !== "";

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
                                    {REASON_LABELS[item.reason] ?? item.reason}
                                </td>
                                <td className="px-3 py-3">
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={state.warehousePurchase}
                                        disabled={savingId === item.id}
                                        onChange={(e) =>
                                            setRowState((prev) => ({
                                                ...prev,
                                                [item.id]: {
                                                    ...state,
                                                    warehousePurchase: e.target.value,
                                                },
                                            }))
                                        }
                                        onBlur={(e) =>
                                            handleWarehouseBlur(item, state, e.target.value)
                                        }
                                        className={numberInputClassName}
                                    />
                                </td>
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
                                        className={numberInputClassName}
                                    />
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <button
                                        type="button"
                                        disabled={savingId === item.id || !canSave}
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
