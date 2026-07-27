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
            <p className="text-xs text-admin-text-secondary">Прайсы ещё не загружены</p>
        );
    }

    return (
        <ul className="divide-y divide-admin-border/70 rounded-lg border border-admin-border">
            {uploaded.map((item) => (
                <li
                    key={item.supplier_id}
                    className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-xs"
                >
                    <span className="shrink-0 font-medium text-admin-text">{item.supplier_name}</span>
                    <span className="min-w-0 truncate text-admin-text-secondary" title={item.original_name || undefined}>
                        {item.original_name || "—"}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums text-admin-text-muted">
                        {formatUploadedAt(item.uploaded_at)}
                    </span>
                </li>
            ))}
        </ul>
    );
}
