"use client";

import Link from "next/link";
import type { AdminBlockItem } from "@/lib/admin-blocks-api";

type Props = {
    items: AdminBlockItem[];
    onDeleteAction: (item: AdminBlockItem) => void;
};

export default function BlocksTable({ items, onDeleteAction }: Props) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-admin-muted">
                    <tr>
                        <th className="px-4 py-3 text-left font-medium text-admin-text-secondary">ID</th>
                        <th className="px-4 py-3 text-left font-medium text-admin-text-secondary">Статус</th>
                        <th className="px-4 py-3 text-left font-medium text-admin-text-secondary">Название</th>
                        <th className="px-4 py-3 text-left font-medium text-admin-text-secondary">Код</th>
                        <th className="px-4 py-3 text-left font-medium text-admin-text-secondary">Обновлено</th>
                        <th className="px-4 py-3 text-right font-medium text-admin-text-secondary">Действия</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {items.map((item) => (
                        <tr key={item.id}>
                            <td className="px-4 py-3 text-admin-text-secondary">{item.id}</td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-admin-text-secondary"}`}>
                                    {item.is_active ? "Активен" : "Выключен"}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-admin-text">{item.name}</td>
                            <td className="px-4 py-3 text-admin-text-secondary">{item.code}</td>
                            <td className="px-4 py-3 text-admin-text-secondary">{item.updated_at ? new Date(item.updated_at).toLocaleString("ru-RU") : "—"}</td>
                            <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                    <Link href={`/admin/blocks/${item.id}/edit`} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-admin-text transition hover:bg-admin-muted">
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
