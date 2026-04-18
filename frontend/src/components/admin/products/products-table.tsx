"use client";

import Link from "next/link";
import { Boxes, Pencil, Trash2 } from "lucide-react";
import type { ProductAdminItem } from "@/lib/admin-products-api";

type Props = {
    items: ProductAdminItem[];
    onDeleteAction: (item: ProductAdminItem) => void;
    onVariantsAction: (item: ProductAdminItem) => void;
};

function StatusBadge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
            }`}
        >
            {active ? "Активен" : "Неактивен"}
        </span>
    );
}

export default function ProductsTable({ items, onDeleteAction, onVariantsAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                <tr>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Название</th>
                    <th className="px-3 py-2.5">Бренд</th>
                    <th className="px-3 py-2.5">Slug</th>
                    <th className="px-3 py-2.5">Статус</th>
                    <th className="px-3 py-2.5">Вариантов</th>
                    <th className="px-3 py-2.5 text-right">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                        <td className="px-3 py-3 text-gray-500">{item.id}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-3 py-3 text-gray-700">{item.brand?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-gray-500">{item.slug}</td>
                        <td className="px-3 py-3">
                            <StatusBadge active={item.is_active} />
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                            <button
                                type="button"
                                onClick={() => onVariantsAction(item)}
                                disabled={item.variants_count <= 0}
                                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Открыть варианты товара ${item.name}`}
                                title="Открыть варианты"
                            >
                                <span className="sr-only">Варианты</span>
                                <Boxes size={14} className="mr-1" />
                                {item.variants_count}
                            </button>
                        </td>
                        <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                                <Link
                                    href={`/admin/products/${item.id}/edit`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                    aria-label={`Редактировать товар ${item.name}`}
                                    title="Редактировать"
                                >
                                    <Pencil size={16} />
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDeleteAction(item)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                    aria-label={`Удалить товар ${item.name}`}
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
