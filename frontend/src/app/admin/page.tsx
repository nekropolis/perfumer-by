"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/ui/admin-page-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import { adminCard, adminCardPadding } from "@/lib/admin-ui-classes";
import { fetchAdminDashboardStats, type AdminDashboardStatsResponse } from "@/lib/admin-dashboard-api";

type DashboardStats = AdminDashboardStatsResponse["data"] | null;
type StatsPeriod = "month" | "quarter" | "year";
type TimelineKey = "ordered" | "cancelled" | "sold";
type StatusLine = { key: string; label: string; count: number };

const KPI_REFRESH_MS = 20_000;

const PERIOD_OPTIONS: { id: StatsPeriod; label: string }[] = [
    { id: "month", label: "Месяц" },
    { id: "quarter", label: "Квартал" },
    { id: "year", label: "Год" },
];

const STATUS_LABEL: Record<string, string> = {
    new: "Новый",
    confirmed: "Подтвержден",
    processing: "В обработке",
    notified: "Подтвержден",
    done: "Выполнен",
    completed: "Выполнен",
    cancelled: "Отменен",
};

const SERIES_CONFIG: { key: TimelineKey; label: string; colorClassName: string }[] = [
    { key: "ordered", label: "Заказано", colorClassName: "bg-indigo-500" },
    { key: "cancelled", label: "Отменено", colorClassName: "bg-rose-500" },
    { key: "sold", label: "Продано", colorClassName: "bg-emerald-500" },
];

function MetricCard({
    title,
    value,
    loading,
    href,
    lines,
}: {
    title: string;
    value: number | null;
    loading: boolean;
    href?: string;
    lines?: StatusLine[];
}) {
    const content = (
        <div
            className={`${adminCard} ${adminCardPadding} min-h-[120px] transition hover:border-admin-primary/30 hover:shadow-md`}
        >
            <div className="text-xs font-semibold uppercase tracking-wide text-admin-text-secondary">{title}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-admin-text sm:text-3xl">
                {loading ? "..." : (value ?? 0).toLocaleString("ru-RU")}
            </div>
            {lines && lines.length > 0 ? (
                <div className="mt-2 space-y-1 border-t border-admin-border pt-2 text-xs text-admin-text-secondary">
                    {lines.map((line) => (
                        <div key={line.key} className="flex items-center justify-between gap-2">
                            <span className="truncate">{line.label}</span>
                            <span className="font-semibold tabular-nums text-admin-text">{line.count}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );

    if (href) {
        return <Link href={href}>{content}</Link>;
    }

    return (
        content
    );
}

export default function AdminPage() {
    const [stats, setStats] = useState<DashboardStats>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [period, setPeriod] = useState<StatsPeriod>("month");

    const loadStats = useCallback(async (currentPeriod: StatsPeriod, signal?: AbortSignal) => {
        setLoadingStats(true);
        try {
            const response = await fetchAdminDashboardStats({ period: currentPeriod, signal });
            setStats(response.data);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            console.error("Failed to load dashboard stats", error);
            setStats(null);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadStats(period, controller.signal);

        return () => {
            controller.abort();
        };
    }, [loadStats, period]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            void loadStats(period);
        }, KPI_REFRESH_MS);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [loadStats, period]);

    const activeOrderStatusRows = useMemo(
        () =>
            Object.entries(stats?.active.orders_by_status ?? {})
                .sort((a, b) => b[1] - a[1]),
        [stats]
    );
    const orderStatusLines = useMemo<StatusLine[]>(
        () =>
            activeOrderStatusRows.map(([status, count]) => ({
                key: status,
                label: STATUS_LABEL[status] ?? status,
                count,
            })),
        [activeOrderStatusRows]
    );
    const productRequestLines = useMemo<StatusLine[]>(
        () => [
            {
                key: "back_in_stock",
                label: "Наличие",
                count: stats?.active.back_in_stock_requests ?? 0,
            },
            {
                key: "callback",
                label: "Звонок",
                count: stats?.active.callback_requests ?? 0,
            },
        ],
        [stats],
    );

    const timelineRows = useMemo(() => {
        const timeline = stats?.month.timeline;
        if (!timeline) {
            return [];
        }
        return timeline.labels.map((label, index) => ({
            label,
            ordered: timeline.ordered[index] ?? 0,
            cancelled: timeline.cancelled[index] ?? 0,
            sold: timeline.sold[index] ?? 0,
        }));
    }, [stats]);

    const chartRows = useMemo(() => {
        if (timelineRows.length <= 1) {
            return timelineRows;
        }
        const maxPoints = period === "month" ? 10 : 12;
        const step = Math.max(1, Math.ceil(timelineRows.length / maxPoints));
        if (step <= 1) {
            return timelineRows;
        }
        const buckets: Array<{ label: string; ordered: number; cancelled: number; sold: number }> = [];
        for (let start = 0; start < timelineRows.length; start += step) {
            const chunk = timelineRows.slice(start, Math.min(start + step, timelineRows.length));
            if (chunk.length === 0) {
                continue;
            }
            const first = chunk[0];
            const last = chunk[chunk.length - 1];
            buckets.push({
                label: first.label === last.label ? first.label : `${first.label}-${last.label}`,
                ordered: chunk.reduce((sum, row) => sum + row.ordered, 0),
                cancelled: chunk.reduce((sum, row) => sum + row.cancelled, 0),
                sold: chunk.reduce((sum, row) => sum + row.sold, 0),
            });
        }
        return buckets;
    }, [period, timelineRows]);
    const xLabelStep = useMemo(() => {
        if (chartRows.length <= 8) {
            return 1;
        }
        if (period === "month") {
            return 3;
        }
        if (period === "quarter") {
            return 1;
        }
        return 2;
    }, [chartRows.length, period]);

    const timelineMax = useMemo(() => {
        let max = 0;
        for (const row of chartRows) {
            max = Math.max(max, row.ordered, row.cancelled, row.sold);
        }
        // Небольшой запас, чтобы верхняя точка не упиралась в рамку.
        return Math.max(1, max + 1);
    }, [chartRows]);
    const chartPoints = useMemo(() => {
        if (chartRows.length === 0) {
            return {
                ordered: "",
                cancelled: "",
                sold: "",
                points: [] as Array<{ x: number; yOrdered: number; yCancelled: number; ySold: number; label: string }>,
            };
        }
        const width = 600;
        const height = 400;
        const leftPad = 56;
        const rightPad = 20;
        const topPad = 24;
        const bottomPad = 54;
        const usableWidth = width - leftPad - rightPad;
        const usableHeight = height - topPad - bottomPad;

        const points = chartRows.map((row, index) => {
            const x =
                chartRows.length === 1
                    ? leftPad + usableWidth / 2
                    : leftPad + (index * usableWidth) / (chartRows.length - 1);
            const yOrdered = topPad + (1 - row.ordered / timelineMax) * usableHeight;
            const yCancelled = topPad + (1 - row.cancelled / timelineMax) * usableHeight;
            const ySold = topPad + (1 - row.sold / timelineMax) * usableHeight;
            return { x, yOrdered, yCancelled, ySold, label: row.label };
        });

        const toPolyline = (key: "yOrdered" | "yCancelled" | "ySold") =>
            points.map((p) => `${p.x},${p[key]}`).join(" ");

        return {
            ordered: toPolyline("yOrdered"),
            cancelled: toPolyline("yCancelled"),
            sold: toPolyline("ySold"),
            points,
        };
    }, [chartRows, timelineMax]);

    return (
        <div className="m-5 space-y-6">
            <AdminPageHeader
                title="Дашборд"
                description="Обзор заказов, запросов и статистики магазина"
            />

            <AdminPageCard>
                <div className="mb-4 text-base font-semibold text-admin-text">Активные задачи</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <MetricCard
                        title="Заказы"
                        value={stats?.active.orders ?? null}
                        loading={loadingStats}
                        href="/admin/orders"
                        lines={orderStatusLines}
                    />
                    <MetricCard
                        title="Запросы товаров"
                        value={
                            stats == null
                                ? null
                                : (stats.active.back_in_stock_requests ?? 0) +
                                (stats.active.callback_requests ?? 0)
                        }
                        loading={loadingStats}
                        href="/admin/stock-notifications"
                        lines={productRequestLines}
                    />
                </div>
            </AdminPageCard>

            <AdminPageCard>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-semibold text-admin-text">Статистика за период</div>
                        <div className="text-sm text-admin-text-secondary">
                            Количество единиц товаров в заказах выбранного периода.
                        </div>
                    </div>
                    <div className="inline-flex rounded-lg border border-admin-border bg-admin-muted p-1">
                        {PERIOD_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setPeriod(option.id)}
                                className={`rounded-md px-3 py-1.5 text-sm transition ${period === option.id ? "bg-admin-primary text-white shadow-sm" : "text-admin-text-secondary hover:bg-admin-surface hover:text-admin-text"}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <MetricCard
                        title="Заказано"
                        value={stats?.month.ordered_products_qty ?? null}
                        loading={loadingStats}
                    />
                    <MetricCard
                        title="Отменено"
                        value={stats?.month.cancelled_products_qty ?? null}
                        loading={loadingStats}
                    />
                    <MetricCard
                        title="Продано"
                        value={stats?.month.sold_products_qty ?? null}
                        loading={loadingStats}
                    />
                </div>

                <div className="mt-3 rounded-lg border border-admin-border bg-admin-muted/40 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-admin-text-secondary">
                        {SERIES_CONFIG.map((series) => (
                            <span key={series.key} className="inline-flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${series.colorClassName}`} />
                                {series.label}
                            </span>
                        ))}
                    </div>
                    <div className="mx-auto h-[400px] w-full max-w-[600px]">
                        <svg viewBox="0 0 600 400" className="h-full w-full">
                            <line x1="56" y1="346" x2="580" y2="346" stroke="#e5e7eb" strokeWidth="1" />
                            <line x1="56" y1="24" x2="56" y2="346" stroke="#e5e7eb" strokeWidth="1" />
                            <text x="318" y="388" textAnchor="middle" fontSize="12" fill="#6b7280">Дата</text>
                            <text x="18" y="200" textAnchor="middle" fontSize="12" fill="#6b7280" transform="rotate(-90,18,200)">
                                Кол-во заказов
                            </text>

                            <polyline fill="none" stroke="#6366f1" strokeWidth="2.2" points={chartPoints.ordered} />
                            <polyline fill="none" stroke="#f43f5e" strokeWidth="2.2" points={chartPoints.cancelled} />
                            <polyline fill="none" stroke="#10b981" strokeWidth="2.2" points={chartPoints.sold} />

                            {chartPoints.points.map((point, index) => (
                                <g key={`p-${point.label}-${index}`}>
                                    <circle cx={point.x} cy={point.yOrdered} r="3" fill="#6366f1" />
                                    <circle cx={point.x} cy={point.yCancelled} r="3" fill="#f43f5e" />
                                    <circle cx={point.x} cy={point.ySold} r="3" fill="#10b981" />

                                    {index === chartRows.length - 1 ? (
                                        <>
                                            <text x={point.x + 8} y={point.yOrdered - 8} textAnchor="start" fontSize="12" fill="#4f46e5">
                                                {chartRows[index]?.ordered ?? 0}
                                            </text>
                                            <text x={point.x + 8} y={point.yCancelled - 8} textAnchor="start" fontSize="12" fill="#e11d48">
                                                {chartRows[index]?.cancelled ?? 0}
                                            </text>
                                            <text x={point.x + 8} y={point.ySold - 8} textAnchor="start" fontSize="12" fill="#059669">
                                                {chartRows[index]?.sold ?? 0}
                                            </text>
                                        </>
                                    ) : null}

                                    {index % xLabelStep === 0 || index === chartRows.length - 1 ? (
                                        <text x={point.x} y="360" textAnchor="middle" fontSize="10" fill="#6b7280">
                                            {point.label}
                                        </text>
                                    ) : null}
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>
            </AdminPageCard>

            <AdminPageCard>
                <div className="mb-4 text-base font-semibold text-admin-text">Товары в наличии</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <MetricCard
                        title="Активные товары"
                        value={stats?.stock.products_in_stock ?? null}
                        loading={loadingStats}
                        href="/admin/products"
                    />
                    <MetricCard
                        title="Активные варианты"
                        value={stats?.stock.variants_in_stock ?? null}
                        loading={loadingStats}
                        href="/admin/products/variants"
                    />
                </div>
            </AdminPageCard>
        </div>
    );
}