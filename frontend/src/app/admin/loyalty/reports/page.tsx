"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { fetchLoyaltyCardsReport } from "@/lib/admin-loyalty-api";

type Row = {
    id: number;
    card_number?: string;
    number?: string;
    discount_percent: string;
    spent_total: string;
    purchases_count: number;
    subtotal_sum: string | null;
};

export default function AdminLoyaltyReportsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [ordersWithCards, setOrdersWithCards] = useState(0);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useUrlPage();
    useResetPageOnChange(setPage, [from, to]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchLoyaltyCardsReport({ from: from || undefined, to: to || undefined, page });
            setRows((data.cards.data || []) as Row[]);
            setOrdersWithCards(data.meta.orders_with_cards || 0);
            setMeta({
                current_page: data.cards.current_page,
                last_page: data.cards.last_page,
                total: data.cards.total,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки отчета");
        } finally {
            setLoading(false);
        }
    }, [from, to, page]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <AdminPageCard>
            <AdminTableToolbar title="Отчеты по лояльности" description="Покупки и суммы по картам за выбранный период">
                <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                    <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm">
                        Применить
                    </button>
                </div>
            </AdminTableToolbar>

            {error && <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />}

            <div className="mb-4 rounded-lg border bg-admin-muted px-4 py-3 text-sm">
                Заказов с примененной картой за период: <span className="font-semibold">{ordersWithCards}</span>
            </div>

            {loading ? (
                <AdminLoadingState text="Загрузка отчета..." />
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-admin-muted text-left text-xs uppercase tracking-[0.08em] text-admin-text-secondary">
                            <tr>
                                <th className="px-3 py-2.5">Карта</th>
                                <th className="px-3 py-2.5">Текущая скидка %</th>
                                <th className="px-3 py-2.5">Покупок</th>
                                <th className="px-3 py-2.5">Сумма заказов</th>
                                <th className="px-3 py-2.5">Накоплено всего</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-t">
                                    <td className="px-3 py-3 font-medium">{row.card_number ?? row.number}</td>
                                    <td className="px-3 py-3">{row.discount_percent}%</td>
                                    <td className="px-3 py-3">{row.purchases_count}</td>
                                    <td className="px-3 py-3">{row.subtotal_sum ?? "0.00"}</td>
                                    <td className="px-3 py-3">{row.spent_total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="mt-4">
                <AdminPagination
                    currentPage={meta?.current_page ?? 1}
                    lastPage={meta?.last_page ?? 1}
                    onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                    onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))}
                />
            </div>
        </AdminPageCard>
    );
}

