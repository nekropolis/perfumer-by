"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    fetchAdminShopDeliverySettings,
    updateAdminShopDeliverySettings,
} from "@/lib/admin-shop-settings-api";

type Props = {
    className?: string;
    fullWidth?: boolean;
};

const MONTHS = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function parseDisplayDateToIso(displayDate: string): string {
    const match = displayDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return "";
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
}

function formatIsoToDisplayDate(isoDate: string): string {
    const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return isoDate;
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
}

function formatHeaderDate(displayDate: string): string {
    const match = displayDate.trim().match(/^(\d{2})\.(\d{2})\.\d{4}$/);
    return match ? `${match[1]}.${match[2]}` : displayDate;
}

function isoToDate(isoDate: string): Date | null {
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToIso(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function AdminWaitingDiscountDateControl({
    className = "",
    fullWidth = false,
}: Props) {
    const [date, setDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [visibleMonth, setVisibleMonth] = useState(() => new Date());
    const rootRef = useRef<HTMLSpanElement>(null);

    const loadDate = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchAdminShopDeliverySettings();
            setDate(res.data.waiting_discount_delivery_date);
        } catch {
            setDate("");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDate();
    }, [loadDate]);

    useEffect(() => {
        const closeCalendar = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setCalendarOpen(false);
            }
        };
        document.addEventListener("mousedown", closeCalendar);
        return () => document.removeEventListener("mousedown", closeCalendar);
    }, []);

    const openCalendar = () => {
        const selectedDate = isoToDate(parseDisplayDateToIso(date));
        setVisibleMonth(selectedDate ?? new Date());
        setCalendarOpen((open) => !open);
    };

    const save = async (isoDate: string) => {
        if (!isoDate) return;
        const previousDate = date;
        const displayDate = formatIsoToDisplayDate(isoDate);
        setDate(displayDate);
        setCalendarOpen(false);
        setSaving(true);
        try {
            const res = await updateAdminShopDeliverySettings({
                waiting_discount_delivery_date: displayDate,
            });
            setDate(res.data.waiting_discount_delivery_date);
        } catch (e) {
            setDate(previousDate);
            window.alert(e instanceof Error ? e.message : "Не удалось сохранить дату");
        } finally {
            setSaving(false);
        }
    };

    const selectedIso = parseDisplayDateToIso(date);
    const todayIso = dateToIso(new Date());
    const firstWeekday = (new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay() + 6) % 7;
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const calendarDays: Array<number | null> = [
        ...Array.from({ length: firstWeekday }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];

    return (
        <span ref={rootRef} className={`relative inline-flex ${fullWidth ? "w-full" : ""}`}>
            <button
                type="button"
                onClick={openCalendar}
                disabled={loading || saving}
                className={`inline-flex origin-center items-center text-sm font-medium tabular-nums text-admin-text underline decoration-admin-border-strong underline-offset-4 transition duration-150 hover:scale-105 hover:text-admin-primary hover:decoration-admin-primary disabled:opacity-60 ${fullWidth ? "w-full justify-start" : ""} ${className}`}
                title="Изменить дату отправки товаров со скидкой"
            >
                {loading
                    ? "Предзаказ…"
                    : saving
                      ? "Предзаказ — сохранение…"
                      : `Предзаказ — ${date ? formatHeaderDate(date) : "Не задана"}`}
            </button>

            {calendarOpen ? (
                <span className="absolute right-0 top-full z-[70] mt-2 w-72 rounded-xl border border-admin-border bg-admin-surface p-3 text-admin-text shadow-xl">
                    <span className="mb-3 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() =>
                                setVisibleMonth(
                                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                                )
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            aria-label="Предыдущий месяц"
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <span className="text-sm font-semibold">
                            {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                setVisibleMonth(
                                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                                )
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            aria-label="Следующий месяц"
                        >
                            <ChevronRight size={17} />
                        </button>
                    </span>

                    <span className="grid grid-cols-7 gap-1">
                        {WEEKDAYS.map((weekday) => (
                            <span
                                key={weekday}
                                className="flex h-7 items-center justify-center text-[10px] font-semibold uppercase text-admin-text-muted"
                            >
                                {weekday}
                            </span>
                        ))}
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <span key={`empty-${index}`} className="h-8" />;
                            }
                            const isoDate = dateToIso(
                                new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day),
                            );
                            const selected = isoDate === selectedIso;
                            const today = isoDate === todayIso;

                            return (
                                <button
                                    key={isoDate}
                                    type="button"
                                    onClick={() => void save(isoDate)}
                                    className={`flex h-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                                        selected
                                            ? "bg-admin-primary text-white"
                                            : today
                                              ? "bg-admin-primary/10 text-admin-primary hover:bg-admin-primary/20"
                                              : "hover:bg-admin-muted"
                                    }`}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </span>
                </span>
            ) : null}
        </span>
    );
}
