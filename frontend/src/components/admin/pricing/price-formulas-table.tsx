"use client";

import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { PriceFormulaItem } from "@/lib/admin-pricing-api";

const RULE_MODE_LABELS: Record<PriceFormulaItem["variant_rule_mode"], string> = {
    apply_to_all: "Все варианты",
    apply_when_match: "Только при совпадении",
    skip_when_match: "Пропуск при совпадении",
};

type Props = {
    items: PriceFormulaItem[];
    sourceLabelAction: (item: PriceFormulaItem) => string;
    onEditAction: (item: PriceFormulaItem) => void;
    onDeleteAction: (item: PriceFormulaItem) => void;
};

type SortedRow = PriceFormulaItem & {
    sourceKey: string;
    stepInSource: number;
    isFirstInSource: boolean;
};

function sourceKey(item: PriceFormulaItem): string {
    return `${item.source_type}:${item.source_id}`;
}

function sortFormulas(items: PriceFormulaItem[]): SortedRow[] {
    const sorted = [...items].sort((a, b) => {
        if (a.source_type !== b.source_type) {
            return a.source_type.localeCompare(b.source_type);
        }
        if (a.source_id !== b.source_id) {
            return a.source_id - b.source_id;
        }
        if (a.sort_order !== b.sort_order) {
            return a.sort_order - b.sort_order;
        }

        return a.id - b.id;
    });

    const stepBySource = new Map<string, number>();

    return sorted.map((item) => {
        const key = sourceKey(item);
        const step = (stepBySource.get(key) ?? 0) + 1;
        stepBySource.set(key, step);

        return {
            ...item,
            sourceKey: key,
            stepInSource: step,
            isFirstInSource: step === 1,
        };
    });
}

function StatusBadge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-admin-text-secondary"
            }`}
        >
            {active ? "Активна" : "Неактивна"}
        </span>
    );
}

export default function PriceFormulasTable({
    items,
    sourceLabelAction,
    onEditAction,
    onDeleteAction,
}: Props) {
    const rows = useMemo(() => sortFormulas(items), [items]);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2.5" title="Порядок проверки внутри одного источника">
                            Шаг
                        </th>
                        <th className="px-3 py-2.5" title="Меньшее значение — выше приоритет">
                            Приоритет
                        </th>
                        <th className="px-3 py-2.5">Название</th>
                        <th className="px-3 py-2.5">Источник</th>
                        <th className="px-3 py-2.5">Коэфф.</th>
                        <th className="px-3 py-2.5">Курс</th>
                        <th className="px-3 py-2.5">Правила</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((item) => (
                        <tr
                            key={item.id}
                            className={`border-t border-admin-border align-top transition hover:bg-admin-muted/70 ${
                                item.isFirstInSource ? "border-t-2 border-t-admin-border" : ""
                            }`}
                        >
                            <td className="px-3 py-3 font-semibold text-admin-primary">{item.stepInSource}</td>
                            <td className="px-3 py-3 text-admin-text-secondary">{item.sort_order}</td>
                            <td className="px-3 py-3 font-medium text-admin-text">{item.name}</td>
                            <td className="px-3 py-3 text-admin-text-secondary">{sourceLabelAction(item)}</td>
                            <td className="px-3 py-3 text-admin-text">{item.multiplier}</td>
                            <td className="px-3 py-3 text-admin-text">{item.rub_rate}</td>
                            <td className="px-3 py-3 text-admin-text-secondary">{RULE_MODE_LABELS[item.variant_rule_mode]}</td>
                            <td className="px-3 py-3">
                                <StatusBadge active={item.is_active} />
                            </td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => onEditAction(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                        aria-label={`Редактировать формулу ${item.name}`}
                                        title="Редактировать"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAction(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                        aria-label={`Удалить формулу ${item.name}`}
                                        title="Удалить"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
