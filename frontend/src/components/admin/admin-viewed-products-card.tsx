"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import { adminSelect } from "@/lib/site-ui-classes";
import {
    fetchAdminDashboardViewedProducts,
    type AdminDashboardViewedPeriod,
    type AdminDashboardViewedProduct,
} from "@/lib/admin-dashboard-api";

const VIEW_PERIOD_OPTIONS: { id: AdminDashboardViewedPeriod; label: string }[] = [
    { id: "year", label: "Год" },
    { id: "quarter", label: "Квартал" },
    { id: "month", label: "Месяц" },
    { id: "week", label: "Неделя" },
    { id: "day", label: "День" },
];

export default function AdminViewedProductsCard() {
    const [period, setPeriod] = useState<AdminDashboardViewedPeriod>("month");
    const [items, setItems] = useState<AdminDashboardViewedProduct[]>([]);
    const [retentionDays, setRetentionDays] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const loadItems = useCallback(async (currentPeriod: AdminDashboardViewedPeriod, signal?: AbortSignal) => {
        setLoading(true);
        try {
            const response = await fetchAdminDashboardViewedProducts({ period: currentPeriod, signal });
            setItems(response.data.items);
            setRetentionDays(response.data.retention_days);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            console.error("Failed to load viewed products", error);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadItems(period, controller.signal);

        return () => {
            controller.abort();
        };
    }, [loadItems, period]);

    return (
        <AdminPageCard>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-admin-text">Просматриваемые продукты</div>
                    <div className="text-xs text-admin-text-secondary">
                        Топ-10 по просмотрам карточки.
                        {retentionDays != null ? ` Счётчики хранятся ${retentionDays} дней.` : null}
                    </div>
                </div>
                <div className="w-36 shrink-0">
                    <select
                        value={period}
                        onChange={(event) => setPeriod(event.target.value as AdminDashboardViewedPeriod)}
                        className={adminSelect}
                        aria-label="Период просмотров"
                    >
                        {VIEW_PERIOD_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                    <thead className="bg-admin-muted/80 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary">
                        <tr>
                            <th className="px-2 py-1">Продукт</th>
                            <th className="whitespace-nowrap px-2 py-1 text-right">Просмотры</th>
                            <th className="w-[1%] px-2 py-1 text-right">
                                <span className="sr-only">Действия</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={3} className="px-2 py-2 text-admin-text-secondary">
                                    Загрузка…
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-2 py-2 text-admin-text-secondary">
                                    Нет просмотров за выбранный период
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="border-t border-admin-border align-middle transition hover:bg-admin-muted/70"
                                >
                                    <td className="px-2 py-1 leading-tight text-admin-text">{item.name}</td>
                                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-admin-text">
                                        {item.views_count.toLocaleString("ru-RU")}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1">
                                        <div className="flex justify-end gap-0.5">
                                            <Link
                                                href={`/admin/products/${item.id}/edit`}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                                aria-label={`Редактировать ${item.name}`}
                                                title="Редактировать"
                                            >
                                                <Pencil size={13} />
                                            </Link>
                                            {item.slug ? (
                                                <Link
                                                    href={`/${item.slug}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                                    aria-label={`Открыть ${item.name} на сайте`}
                                                    title="Открыть на сайте"
                                                >
                                                    <ExternalLink size={13} />
                                                </Link>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </AdminPageCard>
    );
}
