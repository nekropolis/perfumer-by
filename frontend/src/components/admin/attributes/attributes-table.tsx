"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { AttributeAdminItem } from "@/lib/admin-attributes-api";

type Props = {
    items: AttributeAdminItem[];
    onDeleteAction: (item: AttributeAdminItem) => void;
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

export default function AttributesTable({ items, onDeleteAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                <tr>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Название</th>
                    <th className="px-3 py-2.5">Тип</th>
                    <th className="px-3 py-2.5">Опций</th>
                    <th className="px-3 py-2.5">Активна</th>
                    <th className="px-3 py-2.5 text-right">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                        <td className="px-3 py-3 text-gray-500">{item.id}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-3 py-3 text-gray-700">{renderTypeLabel(item.type)}</td>
                        <td className="px-3 py-3 text-gray-700">{item.options_count ?? 0}</td>
                        <td className="px-3 py-3 text-gray-700">{item.is_active ? "Да" : "Нет"}</td>
                        <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                                <Link
                                    href={`/admin/attributes/${item.id}/edit`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
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
