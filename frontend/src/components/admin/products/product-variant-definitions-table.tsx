"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { VariantDefinitionItem } from "@/lib/admin-product-variants-api";

type Props = {
    items: VariantDefinitionItem[];
    onDeleteAction: (item: VariantDefinitionItem) => void;
};

export default function ProductVariantDefinitionsTable({
    items,
    onDeleteAction,
}: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    <tr>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Название</th>
                        <th className="px-3 py-2.5 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                            <td className="px-3 py-3 text-gray-500">{item.id}</td>
                            <td className="px-3 py-3 text-gray-900">{item.title}</td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <Link
                                        href={`/admin/products/variants/${item.id}/edit`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                        aria-label={`Редактировать вариант ${item.title}`}
                                        title="Редактировать"
                                    >
                                        <Pencil size={16} />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAction(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                        aria-label={`Удалить вариант ${item.title}`}
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
