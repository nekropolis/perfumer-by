"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import {
    fetchAdminDeliveryCities,
    syncAdminDeliveryCities,
    type AdminDeliveryCityRow,
    type DeliveryDays,
} from "@/lib/admin-delivery-cities-api";
import { adminBtnPrimary, adminBtnSecondary } from "@/lib/admin-ui-classes";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import useDebouncedValue from "@/hooks/use-debounced-value";
import type { AdminToast } from "@/types/admin";

const DAY_LABELS: { key: keyof DeliveryDays; short: string }[] = [
    { key: "monday", short: "Пн" },
    { key: "tuesday", short: "Вт" },
    { key: "wednesday", short: "Ср" },
    { key: "thursday", short: "Чт" },
    { key: "friday", short: "Пт" },
    { key: "saturday", short: "Сб" },
    { key: "sunday", short: "Вс" },
];

function DeliveryDaysCell({ days }: { days: DeliveryDays }) {
    return (
        <div className="flex flex-wrap gap-0.5">
            {DAY_LABELS.map(({ key, short }) => {
                const on = days[key] === 1;
                return (
                    <span
                        key={key}
                        className={`inline-flex h-5 min-w-[1.4rem] items-center justify-center rounded px-1 text-[10px] font-medium ${
                            on
                                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                                : "bg-admin-muted text-admin-text-secondary/50"
                        }`}
                        title={on ? `${short}: доставка` : `${short}: нет`}
                    >
                        {short}
                    </span>
                );
            })}
        </div>
    );
}

export default function AdminDeliveryCitiesPage() {
    const [rows, setRows] = useState<AdminDeliveryCityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [toast, setToast] = useState<AdminToast | null>(null);
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebouncedValue(query, 350);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal] = useState(0);

    const load = useCallback(async (pageNum: number, q: string) => {
        setLoading(true);
        try {
            const res = await fetchAdminDeliveryCities({
                q,
                page: pageNum,
                per_page: 50,
            });
            setRows(res.data);
            setPage(res.meta.current_page);
            setLastPage(res.meta.last_page);
            setTotal(res.meta.total);
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка загрузки",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        void load(1, debouncedQuery);
    }, [debouncedQuery, load]);

    const handleSync = async () => {
        setSyncing(true);
        setToast(null);
        try {
            const res = await syncAdminDeliveryCities();
            setToast({
                type: "success",
                message: `${res.message}: зоны ${res.data.tracks}, районы ${res.data.districts}, города ${res.data.cities}`,
            });
            await load(page, debouncedQuery);
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка синхронизации",
            });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <AdminPageCard>
            {toast ? (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            ) : null}

            <AdminTableToolbar
                title="Города доставок"
                description="Справочник Ветер: населённые пункты, зоны, районы и дни доставки. Ночной sync + ручная кнопка."
                action={
                    <button
                        type="button"
                        className={`${adminBtnPrimary} inline-flex items-center gap-1.5`}
                        disabled={syncing}
                        onClick={() => void handleSync()}
                    >
                        <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
                        {syncing ? "Синхронизация…" : "Синхронизировать с Ветер"}
                    </button>
                }
            >
                <div className="flex w-full flex-wrap items-end justify-between gap-3">
                    <div className="pb-2 text-xs text-admin-text-secondary">
                        Всего: {total.toLocaleString("ru-RU")}
                    </div>
                    <div className="w-full md:w-1/4 md:min-w-[12rem]">
                        <AdminSearchInput
                            value={query}
                            onChangeAction={setQuery}
                            placeholder="Название города…"
                            syncWithUrl={false}
                            className="[&>div]:w-full [&>div]:md:w-full"
                        />
                    </div>
                </div>
            </AdminTableToolbar>

            {loading ? (
                <AdminLoadingState />
            ) : rows.length === 0 ? (
                <AdminEmptyState
                    title="Городов нет"
                    description="Запустите синхронизацию с Ветер, чтобы загрузить справочник."
                />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-admin-border">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-admin-muted/60 text-xs uppercase tracking-wide text-admin-text-secondary">
                            <tr>
                                <th className="px-3 py-2 font-medium">ID</th>
                                <th className="px-3 py-2 font-medium">Город</th>
                                <th className="px-3 py-2 font-medium">Сельсовет</th>
                                <th className="px-3 py-2 font-medium">Район</th>
                                <th className="px-3 py-2 font-medium">Зона</th>
                                <th className="px-3 py-2 font-medium">Дни доставки</th>
                                <th className="px-3 py-2 font-medium">Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="border-t border-admin-border/80 hover:bg-admin-muted/30"
                                >
                                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-admin-text-secondary">
                                        {row.id}
                                    </td>
                                    <td className="max-w-[14rem] px-3 py-1.5 font-medium text-admin-text">
                                        {debouncedQuery.trim()
                                            ? highlightAdminSearchTerms(row.name, debouncedQuery)
                                            : row.name}
                                    </td>
                                    <td className="max-w-[12rem] px-3 py-1.5 text-admin-text-secondary">
                                        {row.village_council_name
                                            ? /совет/i.test(row.village_council_name)
                                                ? row.village_council_name
                                                : `${row.village_council_name} Совет`
                                            : "—"}
                                    </td>
                                    <td className="max-w-[10rem] px-3 py-1.5 text-admin-text-secondary">
                                        {row.district_name
                                            ? /^г\./i.test(row.district_name) || /р\/н/i.test(row.district_name)
                                                ? row.district_name
                                                : `${row.district_name} р/н`
                                            : "—"}
                                    </td>
                                    <td className="max-w-[10rem] px-3 py-1.5 text-admin-text-secondary">
                                        {row.zone_name || row.region_name || "—"}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <DeliveryDaysCell days={row.delivery_days} />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-1.5">
                                        {row.is_active ? (
                                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                                                активен
                                            </span>
                                        ) : (
                                            <span className="rounded bg-admin-muted px-1.5 py-0.5 text-[11px] font-medium text-admin-text-secondary">
                                                неактивен
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {lastPage > 1 ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        className={adminBtnSecondary}
                        disabled={loading || page <= 1}
                        onClick={() => void load(page - 1, debouncedQuery)}
                    >
                        Назад
                    </button>
                    <span className="text-xs text-admin-text-secondary">
                        Стр. {page} / {lastPage}
                    </span>
                    <button
                        type="button"
                        className={adminBtnSecondary}
                        disabled={loading || page >= lastPage}
                        onClick={() => void load(page + 1, debouncedQuery)}
                    >
                        Вперёд
                    </button>
                </div>
            ) : null}
        </AdminPageCard>
    );
}
