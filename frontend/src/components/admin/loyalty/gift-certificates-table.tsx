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
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
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
                        <tr key={item.id} className="border-t border-admin-border align-top transition hover:bg-admin-muted/70">
                            <td className="px-3 py-3 text-admin-text-secondary">{item.id}</td>
                            <td className="px-3 py-3 font-medium text-admin-text">
                                {item.code?.trim() ? item.code : <span className="text-gray-400">не задан</span>}
                            </td>
                            <td className="px-3 py-3 text-admin-text">{item.initial_amount}</td>
                            <td className="px-3 py-3 text-admin-text">{item.balance_amount}</td>
                            <td className="px-3 py-3 text-admin-text">{item.reserved_amount}</td>
                            <td className="px-3 py-3">{giftCertificateStatusLabel(item.status, item.code)}</td>
                            <td className="px-3 py-3 text-xs text-admin-text-secondary">{item.expires_at || "—"}</td>
                            <td className="px-3 py-3">
                                <div className="flex justify-end gap-1.5">
                                    <Link
                                        href={`/admin/loyalty/certificates/${item.id}/edit`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                        aria-label={`Редактировать сертификат ${item.code ?? `#${item.id}`}`}
                                        title="Редактировать"
                                    >
                                        <Pencil size={16} />
                                    </Link>
                                    {(item.status === "active" || item.status === "void") ? (
                                        <button
                                            type="button"
                                            onClick={() => onToggleActiveAction(item)}
                                            className="inline-flex rounded-lg border border-admin-border px-2 py-1 text-xs text-admin-text transition hover:bg-admin-muted"
                                        >
                                            {item.status === "active" ? "Аннулировать" : "Активировать"}
                                        </button>
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
