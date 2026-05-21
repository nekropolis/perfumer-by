"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { BrandItem } from "@/lib/admin-brands-api";

type Props = {
    items: BrandItem[];
    onDeleteAction: (item: BrandItem) => void;
};

function StatusBadge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-admin-text-secondary"
            }`}
        >
            {active ? "Активен" : "Неактивен"}
        </span>
    );
}

export default function BrandsTable({ items, onDeleteAction }: Props) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                <tr>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Название</th>
                    <th className="px-3 py-2.5">Slug</th>
                    <th className="px-3 py-2.5">Статус</th>
                    <th className="px-3 py-2.5">Товаров</th>
                    <th className="px-3 py-2.5 text-right">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t border-admin-border align-top transition hover:bg-admin-muted/70">
                        <td className="px-3 py-3 text-admin-text-secondary">{item.id}</td>
                        <td className="px-3 py-3 font-medium text-admin-text">{item.name}</td>
                        <td className="px-3 py-3 text-admin-text-secondary">{item.slug}</td>
                        <td className="px-3 py-3">
                            <StatusBadge active={item.is_active} />
                        </td>
                        <td className="px-3 py-3 text-admin-text">{item.products_count}</td>
                        <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                                <Link
                                    href={`/admin/brands/${item.id}/edit`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                    aria-label={`Редактировать бренд ${item.name}`}
                                    title="Редактировать"
                                >
                                    <Pencil size={16} />
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDeleteAction(item)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                    aria-label={`Удалить бренд ${item.name}`}
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
