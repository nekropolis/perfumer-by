"use client";

import { useRef } from "react";
import AdminOrdersDateRangeButton, {
    type AdminOrdersDateRangeButtonHandle,
    getAdminOrdersDateFilterLabel,
} from "@/components/admin/orders/admin-orders-date-range-button";
import type { AdminDashboardSalesPeriod } from "@/lib/admin-dashboard-api";

const PRESET_OPTIONS: { id: Exclude<AdminDashboardSalesPeriod, "custom">; label: string }[] = [
    { id: "month", label: "Месяц" },
    { id: "quarter", label: "Квартал" },
    { id: "year", label: "Год" },
];

export type DashboardSalesPeriodValue = {
    period: AdminDashboardSalesPeriod;
    dateFrom: string;
    dateTo: string;
};

export default function AdminDashboardPeriodPicker({
    value,
    onChangeAction,
}: {
    value: DashboardSalesPeriodValue;
    onChangeAction: (next: DashboardSalesPeriodValue) => void;
}) {
    const dateFilterRef = useRef<AdminOrdersDateRangeButtonHandle>(null);
    const isCustom = value.period === "custom" && Boolean(value.dateFrom || value.dateTo);
    const customLabel = isCustom
        ? getAdminOrdersDateFilterLabel([], { period: "", dateFrom: value.dateFrom, dateTo: value.dateTo })
        : "Выбрать дату";

    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            <div className="inline-flex rounded-lg border border-admin-border bg-admin-muted p-1">
                {PRESET_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => onChangeAction({ period: option.id, dateFrom: "", dateTo: "" })}
                        className={`rounded-lg px-2.5 py-1 text-xs transition ${
                            !isCustom && value.period === option.id
                                ? "bg-admin-primary text-white shadow-sm"
                                : "text-admin-text-secondary hover:bg-admin-surface hover:text-admin-text"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => dateFilterRef.current?.open()}
                    className={`max-w-[11rem] truncate rounded-lg px-2.5 py-1 text-xs transition ${
                        isCustom
                            ? "bg-admin-primary text-white shadow-sm"
                            : "text-admin-text-secondary hover:bg-admin-surface hover:text-admin-text"
                    }`}
                    title={customLabel}
                >
                    {customLabel}
                </button>
            </div>
            <AdminOrdersDateRangeButton
                ref={dateFilterRef}
                hideTrigger
                value={{ period: "", dateFrom: value.dateFrom, dateTo: value.dateTo }}
                onApplyAction={(next) => {
                    if (!next.dateFrom && !next.dateTo) {
                        onChangeAction({ period: "month", dateFrom: "", dateTo: "" });
                        return;
                    }
                    onChangeAction({
                        period: "custom",
                        dateFrom: next.dateFrom,
                        dateTo: next.dateTo,
                    });
                }}
            />
        </div>
    );
}
