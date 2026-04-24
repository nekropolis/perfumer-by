"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { LoyaltyCardItem } from "@/lib/admin-loyalty-api";
import { loyaltyCardDisplayNumber, loyaltyCardStatusLabel } from "@/lib/admin-loyalty-api";

type Props = {
    items: LoyaltyCardItem[];
    onToggleActiveAction: (item: LoyaltyCardItem) => void;
};

export default function LoyaltyCardsTable({ items, onToggleActiveAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    <tr>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Номер</th>
                        <th className="px-3 py-2.5">% скидки</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5">Пользователи</th>
                        <th className="px-3 py-2.5 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        const num = loyaltyCardDisplayNumber(item);
                        const isActive = (item.status ?? (item.is_active ? "active" : "blocked")) === "active";
                        return (
                            <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                                <td className="px-3 py-3 text-gray-500">{item.id}</td>
                                <td className="px-3 py-3 font-medium text-gray-900">{num}</td>
                                <td className="px-3 py-3 text-gray-700">{item.discount_percent}%</td>
                                <td className="px-3 py-3">{loyaltyCardStatusLabel(item)}</td>
                                <td className="px-3 py-3 text-xs text-gray-600">
                                    {(item.users || []).map((u) => `${u.id}:${u.phone || u.name || "—"}`).join(", ") || "—"}
                                </td>
                                <td className="px-3 py-3">
                                    <div className="flex justify-end gap-1.5">
                                        <Link
                                            href={`/admin/loyalty/cards/${item.id}/edit`}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                            aria-label={`Редактировать карту ${num}`}
                                            title="Редактировать"
                                        >
                                            <Pencil size={16} />
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => onToggleActiveAction(item)}
                                            className="inline-flex rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                                        >
                                            {isActive ? "Заблокировать" : "Активировать"}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
