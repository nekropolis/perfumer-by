"use client";

import Link from "next/link";
import type { ProductAdminItem } from "@/lib/admin-products-api";

type Props = {
    items: ProductAdminItem[];
    onDelete: (item: ProductAdminItem) => void;
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

export default function ProductsTable({ items, onDelete }: Props) {
    return (
        <table className="min-w-full text-sm">
            <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Бренд</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Вариантов</th>
                <th className="px-4 py-3 text-right">Действия</th>
            </tr>
            </thead>
            <tbody>
            {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                    <td className="px-4 py-4 text-gray-500">#{item.id}</td>
                    <td className="px-4 py-4 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-4 text-gray-700">{item.brand?.name ?? "—"}</td>
                    <td className="px-4 py-4 text-gray-500">{item.slug}</td>
                    <td className="px-4 py-4">
                        <StatusBadge active={item.is_active} />
                    </td>
                    <td className="px-4 py-4 text-gray-700">{item.variants_count}</td>
                    <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                            <Link
                                href={`/admin/products/${item.id}/edit`}
                                className="inline-flex items-center rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                                Редактировать
                            </Link>

                            <button
                                type="button"
                                onClick={() => onDelete(item)}
                                className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                            >
                                Удалить
                            </button>
                        </div>
                    </td>
                </tr>
            ))}
            </tbody>
        </table>
    );
}
