"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { AdminPostItem } from "@/lib/admin-posts-api";

type Props = {
    items: AdminPostItem[];
    onDeleteAction: (item: AdminPostItem) => void;
};

const TYPE_LABEL: Record<AdminPostItem["type"], string> = {
    news: "Новость",
    article: "Статья",
};

function truncateTitle(value: string): string {
    const normalized = value.trim();
    if (normalized.length <= 40) {
        return normalized;
    }
    return `${normalized.slice(0, 40)}...`;
}

export default function PostsTable({ items, onDeleteAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    <tr>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5">Название</th>
                        <th className="px-3 py-2.5">Тип</th>
                        <th className="px-3 py-2.5">Обновлено</th>
                        <th className="px-3 py-2.5 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-100 align-center transition hover:bg-gray-50/70">
                            <td className="px-3 py-3 text-gray-500">{item.id}</td>
                            <td className="px-3 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                    {item.is_active ? "Активна" : "Выключена"}
                                </span>
                            </td>
                            <td className="max-w-[22rem] px-3 py-3 font-medium text-gray-900" title={item.title}>
                                {truncateTitle(item.title)}
                            </td>
                            <td className="px-3 py-3 text-gray-600">{TYPE_LABEL[item.type]}</td>
                            <td className="px-3 py-3 text-gray-500">
                                {item.updated_at ? new Date(item.updated_at).toLocaleDateString("ru-RU") : "—"}
                            </td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <Link
                                        href={`/admin/posts/${item.id}/edit`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                        aria-label={`Редактировать ${item.title}`}
                                        title="Редактировать"
                                    >
                                        <Pencil size={16} />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAction(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                        aria-label={`Удалить ${item.title}`}
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
