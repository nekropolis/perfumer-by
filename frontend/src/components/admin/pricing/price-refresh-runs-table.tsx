"use client";

import type { PriceRefreshRunItem } from "@/lib/admin-pricing-api";
import PriceRefreshRunStats from "@/components/admin/pricing/price-refresh-run-stats";

const STATUS_LABELS: Record<string, string> = {
    queued: "В очереди",
    running: "Выполняется",
    completed: "Завершён",
    failed: "Ошибка",
};

function formatDateTime(value?: string | null): string {
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

function StatusBadge({ status }: { status: string }) {
    const styles =
        status === "completed"
            ? "bg-green-100 text-green-700"
            : status === "failed"
              ? "bg-red-100 text-red-700"
              : status === "running"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-admin-text-secondary";

    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

type Props = {
    items: PriceRefreshRunItem[];
};

export default function PriceRefreshRunsTable({ items }: Props) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                    <tr>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Дата</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5">Статистика</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((run) => (
                        <tr
                            key={run.id}
                            className="border-t border-admin-border align-top transition hover:bg-admin-muted/70"
                        >
                            <td className="px-3 py-3 text-admin-text-secondary">{run.id}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-admin-text">
                                {formatDateTime(run.started_at || run.created_at)}
                            </td>
                            <td className="px-3 py-3">
                                <StatusBadge status={run.status} />
                            </td>
                            <td className="px-3 py-3 text-xs text-admin-text-secondary">
                                <PriceRefreshRunStats
                                    stats={run.stats as Record<string, unknown> | null}
                                    errorMessage={run.error_message}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
