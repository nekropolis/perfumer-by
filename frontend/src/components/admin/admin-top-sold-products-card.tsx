"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminDashboardPeriodPicker, {
    type DashboardSalesPeriodValue,
} from "@/components/admin/admin-dashboard-period-picker";
import {
    fetchAdminDashboardTopSoldProducts,
    type AdminDashboardTopSoldProduct,
} from "@/lib/admin-dashboard-api";

export default function AdminTopSoldProductsCard() {
    const [periodValue, setPeriodValue] = useState<DashboardSalesPeriodValue>({
        period: "month",
        dateFrom: "",
        dateTo: "",
    });
    const [items, setItems] = useState<AdminDashboardTopSoldProduct[]>([]);
    const [loading, setLoading] = useState(true);

    const loadItems = useCallback(
        async (current: DashboardSalesPeriodValue, signal?: AbortSignal) => {
            setLoading(true);
            try {
                const response = await fetchAdminDashboardTopSoldProducts({
                    period: current.period,
                    dateFrom: current.dateFrom,
                    dateTo: current.dateTo,
                    signal,
                });
                setItems(response.data.items);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }
                console.error("Failed to load top sold products", error);
                setItems([]);
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        const controller = new AbortController();
        void loadItems(periodValue, controller.signal);

        return () => {
            controller.abort();
        };
    }, [loadItems, periodValue]);

    return (
        <AdminPageCard className="overflow-visible">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-admin-text">Самые продаваемые</div>
                    <div className="text-xs text-admin-text-secondary">
                        Топ-10 продуктов за период. Варианты учитываются в сумме.
                    </div>
                </div>
                <AdminDashboardPeriodPicker value={periodValue} onChangeAction={setPeriodValue} />
            </div>

            <div>
                <table className="min-w-full text-xs">
                    <thead className="bg-admin-muted/80 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary">
                        <tr>
                            <th className="px-2 py-1">Продукт</th>
                            <th className="whitespace-nowrap px-2 py-1 text-right">Продано</th>
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
                                    Нет продаж за выбранный период
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="border-t border-admin-border align-middle transition hover:bg-admin-muted/70"
                                >
                                    <td className="relative px-2 py-1 leading-tight text-admin-text">
                                        <span className="group relative inline-flex max-w-full" tabIndex={0}>
                                            <span className="truncate">{item.name}</span>
                                            {item.variants.length > 0 ? (
                                                <span className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 min-w-[12rem] rounded-lg border border-admin-border bg-admin-surface px-2.5 py-2 text-[11px] text-admin-text shadow-lg group-hover:visible group-focus-within:visible">
                                                    <div className="mb-1 font-semibold">Варианты</div>
                                                    <div className="space-y-1 text-admin-text-secondary">
                                                        {item.variants.map((variant) => (
                                                            <div
                                                                key={`${item.id}-${variant.id}-${variant.title}`}
                                                                className="flex items-center justify-between gap-3"
                                                            >
                                                                <span className="truncate">{variant.title}</span>
                                                                <span className="font-semibold tabular-nums text-admin-text">
                                                                    {variant.qty.toLocaleString("ru-RU")}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </span>
                                            ) : null}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-admin-text">
                                        {item.qty.toLocaleString("ru-RU")}
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
