"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminDashboardPeriodPicker, {
    type DashboardSalesPeriodValue,
} from "@/components/admin/admin-dashboard-period-picker";
import { fetchAdminDashboardNetProfit, type AdminDashboardNetProfitResponse } from "@/lib/admin-dashboard-api";
import { formatMoneyRub } from "@/lib/format-money-display";

type ProfitData = AdminDashboardNetProfitResponse["data"] | null;

const EMPTY_PROFIT: NonNullable<ProfitData> = {
    period: "month",
    date_from: "",
    date_to: "",
    revenue: "0.00",
    cost: "0.00",
    product_profit: "0.00",
    delivery_expense: "0.00",
    net_profit: "0.00",
};

function isNegativeMoney(raw: string): boolean {
    const value = raw.trim();
    return value.startsWith("-") && value !== "-0.00" && value !== "-0";
}

export default function AdminNetProfitCard() {
    const [periodValue, setPeriodValue] = useState<DashboardSalesPeriodValue>({
        period: "month",
        dateFrom: "",
        dateTo: "",
    });
    const [data, setData] = useState<ProfitData>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async (current: DashboardSalesPeriodValue, signal?: AbortSignal) => {
        setLoading(true);
        try {
            const response = await fetchAdminDashboardNetProfit({
                period: current.period,
                dateFrom: current.dateFrom,
                dateTo: current.dateTo,
                signal,
            });
            setData(response.data);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            console.error("Failed to load net profit", error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadData(periodValue, controller.signal);

        return () => {
            controller.abort();
        };
    }, [loadData, periodValue]);

    const view = data ?? EMPTY_PROFIT;
    const netNegative = !loading && isNegativeMoney(view.net_profit);

    return (
        <AdminPageCard>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-admin-text">Чистая прибыль</div>
                    <div className="text-xs text-admin-text-secondary">
                        Цена продажи после скидок минус цена входа. Доставка — отдельная статья расхода.
                    </div>
                </div>
                <AdminDashboardPeriodPicker value={periodValue} onChangeAction={setPeriodValue} />
            </div>

            <div className={`mt-3 text-2xl font-bold tabular-nums sm:text-3xl ${netNegative ? "text-rose-600" : "text-admin-text"}`}>
                {loading ? "…" : formatMoneyRub(view.net_profit)}
            </div>

            <div className="mt-3 space-y-1.5 border-t border-admin-border pt-3 text-xs text-admin-text-secondary">
                <div className="flex items-center justify-between gap-3">
                    <span>Выручка после скидок</span>
                    <span className="font-semibold tabular-nums text-admin-text">
                        {loading ? "…" : formatMoneyRub(view.revenue)}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span>Себестоимость</span>
                    <span className="font-semibold tabular-nums text-admin-text">
                        {loading ? "…" : formatMoneyRub(view.cost)}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span>Прибыль по товарам</span>
                    <span className="font-semibold tabular-nums text-admin-text">
                        {loading ? "…" : formatMoneyRub(view.product_profit)}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span>Доставка (расход)</span>
                    <span className="font-semibold tabular-nums text-admin-text">
                        {loading ? "…" : formatMoneyRub(view.delivery_expense)}
                    </span>
                </div>
            </div>
        </AdminPageCard>
    );
}
