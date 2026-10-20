"use client";

import Link from "next/link";
import type { AdminCatalogLandingItem } from "@/lib/admin-catalog-landings-api";

type Props = {
    items: AdminCatalogLandingItem[];
    onDeleteAction: (item: AdminCatalogLandingItem) => void;
};

export default function CatalogLandingsTable({ items, onDeleteAction }: Props) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
                <thead className="border-b border-admin-border text-xs uppercase text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2 font-medium">Slug</th>
                        <th className="px-3 py-2 font-medium">H1</th>
                        <th className="px-3 py-2 font-medium">Пол</th>
                        <th className="px-3 py-2 font-medium text-center">Активна</th>
                        <th className="px-3 py-2 font-medium text-right">Sort</th>
                        <th className="px-3 py-2 font-medium text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-b border-admin-border/70">
                            <td className="px-3 py-2 font-mono text-xs">{item.slug}</td>
                            <td className="px-3 py-2">{item.h1}</td>
                            <td className="px-3 py-2 text-admin-text-secondary">{item.gender || "—"}</td>
                            <td className="px-3 py-2 text-center">{item.is_active ? "✓" : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{item.sort}</td>
                            <td className="px-3 py-2">
                                <div className="flex justify-end gap-2">
                                    <Link
                                        href={`/catalog/${item.slug}`}
                                        target="_blank"
                                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-admin-text transition hover:bg-admin-muted"
                                    >
                                        Сайт
                                    </Link>
                                    <Link
                                        href={`/admin/catalog-landings/${item.id}/edit`}
                                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-admin-text transition hover:bg-admin-muted"
                                    >
                                        Изменить
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAction(item)}
                                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
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
