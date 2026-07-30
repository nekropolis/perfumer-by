"use client";

import { useEffect, useRef, useState } from "react";
import type { ManualPriceReviewItem } from "@/lib/admin-pricing-api";
import { previewManualPriceRetail } from "@/lib/admin-pricing-api";

export const MANUAL_PRICE_REASON_LABELS: Record<string, string> = {
    no_supplier_match: "Нет поставщика",
    warehouse_offer_gap: "Разница склад >10%",
    warehouse_blend_gap: "Разница офер >30%",
    allparfume_no_match: "Allparfume: нет подходящего оффера",
    allparfume_no_input: "Allparfume: нет входа",
};

const REASON_LABELS = MANUAL_PRICE_REASON_LABELS;

type RowState = {
    warehousePurchase: string;
    formulaInput: string;
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

const inputBaseClassName =
    "rounded border border-admin-border bg-white px-1.5 py-1 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
/** Вход склад / Расчётная: ~123,00 */
const inputCompactClassName = `${inputBaseClassName} w-[4.25rem]`;
/** Розница BYN: ~1234,00 */
const inputRetailClassName = `${inputBaseClassName} w-[5rem]`;

function formatTenths(value: string | number | null | undefined): string {
    if (value == null || value === "") {
        return "";
    }
    const normalized = String(value).trim().replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
        return String(value);
    }
    // Округление до десятых, отображение с нулём: 45.38 → 45.40, 23.3 → 23.30
    return (Math.round(n * 10) / 10).toFixed(2);
}

/** Подтянуть старый формат «45.4» → «45.40» без ломания ввода «45.» */
function ensureFormulaDisplay(value: string): string {
    const trimmed = value.trim().replace(",", ".");
    if (trimmed === "") {
        return value;
    }
    if (/^\d+\.\d$/.test(trimmed)) {
        return formatTenths(trimmed);
    }
    return value;
}

function formatMoney2(value: string | number | null | undefined): string {
    if (value == null || value === "") {
        return "";
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return String(value);
    }
    return n.toFixed(2);
}

function defaultRowState(item: ManualPriceReviewItem): RowState {
    return {
        warehousePurchase: formatMoney2(item.warehouse_purchase),
        formulaInput: formatTenths(item.formula_input),
        price: formatMoney2(item.manual_retail_price),
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
    const previewTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        const timers = previewTimers.current;
        return () => {
            for (const timer of Object.values(timers)) {
                clearTimeout(timer);
            }
        };
    }, []);

    const getState = (item: ManualPriceReviewItem): RowState => {
        const state = rowState[item.id] ?? defaultRowState(item);
        const formulaInput = ensureFormulaDisplay(state.formulaInput);
        if (formulaInput === state.formulaInput) {
            return state;
        }
        return { ...state, formulaInput };
    };

    const scheduleRetailPreview = (item: ManualPriceReviewItem, formulaInput: string) => {
        const existing = previewTimers.current[item.id];
        if (existing) {
            clearTimeout(existing);
        }
        previewTimers.current[item.id] = setTimeout(() => {
            const value = formulaInput.trim();
            if (value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
                return;
            }
            const rounded = Number(formatTenths(value));
            void (async () => {
                try {
                    const res = await previewManualPriceRetail(item.id, rounded);
                    setRowState((prev) => {
                        const current = prev[item.id] ?? defaultRowState(item);
                        if (Number(current.formulaInput) !== rounded && current.formulaInput.trim() !== value) {
                            return prev;
                        }
                        return {
                            ...prev,
                            [item.id]: {
                                ...current,
                                price: formatMoney2(res.data.manual_retail_price),
                            },
                        };
                    });
                } catch {
                    // preview best-effort
                }
            })();
        }, 350);
    };

    const handleWarehouseBlur = (
        item: ManualPriceReviewItem,
        state: RowState,
        rawValue: string,
    ) => {
        const next = formatMoney2(rawValue.trim());
        const revert = () => {
            setRowState((prev) => ({
                ...prev,
                [item.id]: {
                    ...state,
                    warehousePurchase: formatMoney2(item.warehouse_purchase),
                },
            }));
        };

        if (next === "" || !Number.isFinite(Number(next)) || Number(next) < 0) {
            revert();
            return;
        }

        setRowState((prev) => ({
            ...prev,
            [item.id]: { ...state, warehousePurchase: next },
        }));

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

    const handleFormulaBlur = (item: ManualPriceReviewItem, state: RowState, rawValue: string) => {
        const next = formatTenths(rawValue.trim());
        if (next === "" || !Number.isFinite(Number(next)) || Number(next) < 0) {
            setRowState((prev) => ({
                ...prev,
                [item.id]: {
                    ...state,
                    formulaInput: formatTenths(item.formula_input),
                },
            }));
            return;
        }
        setRowState((prev) => ({
            ...prev,
            [item.id]: { ...state, formulaInput: next },
        }));
        scheduleRetailPreview(item, next);
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary">
                    <tr>
                        <th className="w-10 px-1.5 py-2 text-center">Витрина</th>
                        <th className="min-w-[16rem] px-2 py-2 sm:min-w-[20rem]">Товар</th>
                        <th className="whitespace-nowrap px-2 py-2">Причина</th>
                        <th className="whitespace-nowrap px-1.5 py-2">Вход склад</th>
                        <th className="whitespace-nowrap px-1.5 py-2">Расчётная</th>
                        <th className="whitespace-nowrap px-1.5 py-2">Вход пост.</th>
                        <th className="whitespace-nowrap px-1.5 py-2">Код</th>
                        <th className="whitespace-nowrap px-1.5 py-2">Розница, BYN</th>
                        <th className="px-2 py-2 text-right">Действие</th>
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
                                className="border-t border-admin-border align-middle transition hover:bg-admin-muted/70"
                            >
                                <td className="px-1.5 py-2 text-center align-middle">
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
                                        className="h-3.5 w-3.5"
                                        title="На сайт"
                                    />
                                </td>
                                <td className="min-w-[16rem] px-2 py-2 align-middle sm:min-w-[20rem]">
                                    <div className="font-medium leading-snug text-admin-text">
                                        {item.product_name}
                                    </div>
                                    <div className="text-xs leading-snug text-admin-text-secondary">
                                        {item.variant_title}
                                    </div>
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 align-middle text-xs text-admin-text-secondary">
                                    {REASON_LABELS[item.reason] ?? item.reason}
                                </td>
                                <td className="px-1.5 py-2 align-middle">
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
                                        className={inputCompactClassName}
                                    />
                                </td>
                                <td className="px-1.5 py-2 align-middle">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={state.formulaInput}
                                        disabled={savingId === item.id}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(",", ".");
                                            if (value !== "" && !/^\d*\.?\d*$/.test(value)) {
                                                return;
                                            }
                                            setRowState((prev) => ({
                                                ...prev,
                                                [item.id]: {
                                                    ...state,
                                                    formulaInput: value,
                                                },
                                            }));
                                            scheduleRetailPreview(item, value);
                                        }}
                                        onBlur={(e) =>
                                            handleFormulaBlur(item, state, e.target.value)
                                        }
                                        className={inputCompactClassName}
                                        title="Вход для формулы (закуп), до десятых → 45.40"
                                    />
                                </td>
                                <td className="whitespace-nowrap px-1.5 py-2 align-middle tabular-nums text-admin-text">
                                    {item.supplier_purchase ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-1.5 py-2 align-middle tabular-nums text-admin-text-secondary">
                                    {code}
                                </td>
                                <td className="px-1.5 py-2 align-middle">
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
                                        onBlur={(e) => {
                                            const next = formatMoney2(e.target.value.trim());
                                            if (next === "" || !Number.isFinite(Number(next))) {
                                                return;
                                            }
                                            setRowState((prev) => ({
                                                ...prev,
                                                [item.id]: { ...state, price: next },
                                            }));
                                        }}
                                        className={inputRetailClassName}
                                    />
                                </td>
                                <td className="px-2 py-2 text-right align-middle">
                                    <button
                                        type="button"
                                        disabled={savingId === item.id || !canSave}
                                        onClick={() => void onSaveAction(item, state)}
                                        className="rounded border border-admin-border px-2 py-1 text-xs hover:bg-admin-muted disabled:opacity-50"
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
