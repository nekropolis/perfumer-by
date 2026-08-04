"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { AttributeAdminItem } from "@/lib/admin-attributes-api";
import { adminCheckbox } from "@/lib/admin-ui-classes";

type Props = {
    items: AttributeAdminItem[];
    onDeleteAction: (item: AttributeAdminItem) => void;
    onToggleFilterAction: (item: AttributeAdminItem, nextValue: boolean) => void;
    pendingFilterIds?: number[];
};

function renderTypeLabel(type: AttributeAdminItem["type"]) {
    if (type === "text") {
        return "Текст";
    }

    if (type === "select") {
        return "Один из списка";
    }

    return "Несколько из списка";
}

export default function AttributesTable({
    items,
    onDeleteAction,
    onToggleFilterAction,
    pendingFilterIds = [],
}: Props) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                <tr>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Фильтр</th>
                    <th className="px-3 py-2.5">Название</th>
                    <th className="px-3 py-2.5">Тип</th>
                    <th className="px-3 py-2.5">Опций</th>
                    <th className="px-3 py-2.5">Активна</th>
                    <th className="px-3 py-2.5 text-right">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t border-admin-border align-top transition hover:bg-admin-muted/70">
                        <td className="px-3 py-3 text-admin-text-secondary">{item.id}</td>
                        <td className="px-3 py-3 text-admin-text">
                            <label className="inline-flex cursor-pointer items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={Boolean(item.is_filterable)}
                                    disabled={pendingFilterIds.includes(item.id)}
                                    onChange={(e) => onToggleFilterAction(item, e.target.checked)}
                                    className={adminCheckbox}
                                />
                            </label>
                        </td>
                        <td className="px-3 py-3 font-medium text-admin-text">{item.name}</td>
                        <td className="px-3 py-3 text-admin-text">{renderTypeLabel(item.type)}</td>
                        <td className="px-3 py-3 text-admin-text">{item.options_count ?? 0}</td>
                        <td className="px-3 py-3 text-admin-text">{item.is_active ? "Да" : "Нет"}</td>
                        <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                                <Link
                                    href={`/admin/attributes/${item.id}/edit`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                    aria-label={`Редактировать атрибут ${item.name}`}
                                    title="Редактировать"
                                >
                                    <Pencil size={16} />
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDeleteAction(item)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                    aria-label={`Удалить атрибут ${item.name}`}
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
