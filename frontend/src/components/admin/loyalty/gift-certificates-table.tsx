"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { giftCertificateStatusLabel, type GiftCertificateItem } from "@/lib/admin-loyalty-api";

type Props = {
    items: GiftCertificateItem[];
    onToggleActiveAction: (item: GiftCertificateItem) => void;
};

export default function GiftCertificatesTable({ items, onToggleActiveAction }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    <tr>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Код</th>
                        <th className="px-3 py-2.5">Номинал</th>
                        <th className="px-3 py-2.5">Баланс</th>
                        <th className="px-3 py-2.5">Резерв</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5">Истекает</th>
                        <th className="px-3 py-2.5 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-100 align-top transition hover:bg-gray-50/70">
                            <td className="px-3 py-3 text-gray-500">{item.id}</td>
                            <td className="px-3 py-3 font-medium text-gray-900">{item.code}</td>
                            <td className="px-3 py-3 text-gray-700">{item.initial_amount}</td>
                            <td className="px-3 py-3 text-gray-700">{item.balance_amount}</td>
                            <td className="px-3 py-3 text-gray-700">{item.reserved_amount}</td>
                            <td className="px-3 py-3">{giftCertificateStatusLabel(item.status)}</td>
                            <td className="px-3 py-3 text-xs text-gray-600">{item.expires_at || "—"}</td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <Link
                                        href={`/admin/loyalty/certificates/${item.id}/edit`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                        aria-label={`Редактировать сертификат ${item.code}`}
                                        title="Редактировать"
                                    >
                                        <Pencil size={16} />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onToggleActiveAction(item)}
                                        className="inline-flex rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                                    >
                                        {item.status === "active" ? "Аннулировать" : "Активировать"}
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
