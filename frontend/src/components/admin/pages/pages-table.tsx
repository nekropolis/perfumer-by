"use client";

import Link from "next/link";
import type { AdminPageItem } from "@/lib/admin-pages-api";

type Props = {
    items: AdminPageItem[];
    onDeleteAction: (item: AdminPageItem) => void;
};

export default function PagesTable({ items, onDeleteAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Название</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Slug</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Обновлено</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Действия</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {items.map((item) => (
                        <tr key={item.id}>
                            <td className="px-4 py-3 text-gray-500">{item.id}</td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                                    {item.is_active ? "Активна" : "Выключена"}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                            <td className="px-4 py-3 text-gray-600">/{item.slug}</td>
                            <td className="px-4 py-3 text-gray-500">{item.updated_at ? new Date(item.updated_at).toLocaleString("ru-RU") : "—"}</td>
                            <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                    <Link href={`/admin/pages/${item.id}/edit`} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                                        Редактировать
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAction(item)}
                                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
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
