"use client";

import Link from "next/link";
import type { BrandItem } from "@/lib/admin-brands-api";

type Props = {
    items: BrandItem[];
    onDelete: (item: BrandItem) => void;
};

export default function BrandsTable({ items, onDelete }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                <tr className="text-left">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Название</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Активен</th>
                    <th className="px-4 py-3">Товаров</th>
                    <th className="px-4 py-3">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => (
                    <tr key={item.id} className="border-t align-top">
                        <td className="px-4 py-3">{item.id}</td>
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-gray-500">{item.slug}</td>
                        <td className="px-4 py-3">{item.is_active ? "Да" : "Нет"}</td>
                        <td className="px-4 py-3">{item.products_count}</td>
                        <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                                <Link
                                    href={`/admin/brands/${item.id}/edit`}
                                    className="rounded-lg border px-3 py-1 text-sm"
                                >
                                    Редактировать
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDelete(item)}
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
