"use client";

import Link from "next/link";
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
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                <tr className="text-left">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Название</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Опций</th>
                    <th className="px-4 py-3">Активна</th>
                    <th className="px-4 py-3">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t align-top">
                        <td className="px-4 py-3">{item.id}</td>
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3">{renderTypeLabel(item.type)}</td>
                        <td className="px-4 py-3">{item.options_count ?? 0}</td>
                        <td className="px-4 py-3">{item.is_active ? "Да" : "Нет"}</td>
                        <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                                <Link
                                    href={`/admin/attributes/${item.id}/edit`}
                                    className="rounded-lg border px-3 py-1 text-sm"
                                >
                                    Редактировать
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDeleteAction(item)}
                                    className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600"
                                >
                                    Удалить
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
