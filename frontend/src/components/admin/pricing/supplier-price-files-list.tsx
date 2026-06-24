"use client";

import type { SupplierPriceFileMeta } from "@/lib/admin-pricing-api";

function formatUploadedAt(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

type Props = {
    items: SupplierPriceFileMeta[];
};

export default function SupplierPriceFilesList({ items }: Props) {
    const uploaded = items.filter((item) => Boolean(item.storage_path));

    if (uploaded.length === 0) {
        return (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-admin-text-secondary">
                Прайсы ещё не загружены
            </p>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2.5">Поставщик</th>
                        <th className="px-3 py-2.5">Файл</th>
                        <th className="px-3 py-2.5">Загружен</th>
                    </tr>
                </thead>
                <tbody>
                    {uploaded.map((item) => (
                        <tr
                            key={item.supplier_id}
                            className="border-t border-admin-border transition hover:bg-admin-muted/70"
                        >
                            <td className="px-3 py-3 font-medium text-admin-text">{item.supplier_name}</td>
                            <td className="px-3 py-3 text-admin-text-secondary">{item.original_name || "—"}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-admin-text-secondary">
                                {formatUploadedAt(item.uploaded_at)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
