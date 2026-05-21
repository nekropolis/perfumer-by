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
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
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
                        <tr key={item.id} className="border-t border-admin-border align-center transition hover:bg-admin-muted/70">
                            <td className="px-3 py-3 text-admin-text-secondary">{item.id}</td>
                            <td className="px-3 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-admin-text-secondary"}`}>
                                    {item.is_active ? "Активна" : "Выключена"}
                                </span>
                            </td>
                            <td className="max-w-[22rem] px-3 py-3 font-medium text-admin-text" title={item.title}>
                                {truncateTitle(item.title)}
                            </td>
                            <td className="px-3 py-3 text-admin-text-secondary">{TYPE_LABEL[item.type]}</td>
                            <td className="px-3 py-3 text-admin-text-secondary">
                                {item.updated_at ? new Date(item.updated_at).toLocaleDateString("ru-RU") : "—"}
                            </td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <Link
                                        href={`/admin/posts/${item.id}/edit`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
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
