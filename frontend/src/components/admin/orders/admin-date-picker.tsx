"use client";

import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getMonth,
    getYear,
    isSameDay,
    isSameMonth,
    parseISO,
    setMonth,
    setYear,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const YEAR_SPAN = 10;

type AdminDatePickerProps = {
    value: string;
    onChangeAction: (value: string) => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
};

function parseValue(value: string): Date | null {
    if (!value.trim()) {
        return null;
    }
    try {
        const date = parseISO(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
}

function toIsoDate(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

export default function AdminDatePicker({
    value,
    onChangeAction,
    className = "",
    placeholder = "Выберите дату",
    disabled = false,
}: AdminDatePickerProps) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const selected = parseValue(value);
    const today = new Date();
    const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? today));

    useEffect(() => {
        if (selected) {
            setViewMonth(startOfMonth(selected));
        }
    }, [value]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const displayLabel = selected ? format(selected, "d MMMM yyyy", { locale: ru }) : "";

    const pickDay = (day: Date) => {
        onChangeAction(toIsoDate(day));
        setOpen(false);
    };

    const yearOptions = Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, offset) => getYear(today) - YEAR_SPAN + offset);

    return (
        <div ref={rootRef} className={`relative ${className}`.trim()}>
            <button
                type="button"
                id={`${id}-trigger`}
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-controls={`${id}-calendar`}
                onClick={() => setOpen((prev) => !prev)}
                className="flex w-full items-center gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-left text-sm text-admin-text transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
                <Calendar className="h-4 w-4 shrink-0 text-admin-text-secondary" strokeWidth={2} aria-hidden />
                <span className={displayLabel ? "font-medium text-admin-text" : "text-admin-text-secondary"}>
                    {displayLabel || placeholder}
                </span>
            </button>

            {open ? (
                <div
                    id={`${id}-calendar`}
                    role="dialog"
                    aria-modal="false"
                    aria-label="Выбор даты"
                    className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-admin-border bg-admin-surface p-3 shadow-xl sm:left-auto sm:right-0 sm:min-w-[17.5rem]"
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setViewMonth((m) => subMonths(m, 1))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-admin-border text-admin-text transition hover:bg-admin-muted"
                            aria-label="Предыдущий месяц"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                        </button>

                        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                            <select
                                value={getMonth(viewMonth)}
                                onChange={(e) => setViewMonth((m) => setMonth(m, Number(e.target.value)))}
                                className="max-w-[7.5rem] rounded-md border border-admin-border bg-admin-surface px-1.5 py-1 text-xs font-medium capitalize text-admin-text"
                                aria-label="Месяц"
                            >
                                {Array.from({ length: 12 }, (_, monthIndex) => (
                                    <option key={monthIndex} value={monthIndex}>
                                        {format(setMonth(new Date(2020, 0, 1), monthIndex), "LLLL", { locale: ru })}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={getYear(viewMonth)}
                                onChange={(e) => setViewMonth((m) => setYear(m, Number(e.target.value)))}
                                className="rounded-md border border-admin-border bg-admin-surface px-1.5 py-1 text-xs font-medium text-admin-text"
                                aria-label="Год"
                            >
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => setViewMonth((m) => addMonths(m, 1))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-admin-border text-admin-text transition hover:bg-admin-muted"
                            aria-label="Следующий месяц"
                        >
                            <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                    </div>

                    <div className="mb-1 grid grid-cols-7 gap-0.5">
                        {WEEKDAYS.map((label) => (
                            <div
                                key={label}
                                className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-admin-text-secondary"
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5">
                        {calendarDays.map((day) => {
                            const inMonth = isSameMonth(day, viewMonth);
                            const isSelected = selected ? isSameDay(day, selected) : false;
                            const isToday = isSameDay(day, today);

                            return (
                                <button
                                    key={day.toISOString()}
                                    type="button"
                                    disabled={!inMonth}
                                    onClick={() => pickDay(day)}
                                    className={[
                                        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition",
                                        !inMonth && "pointer-events-none invisible",
                                        inMonth && !isSelected && "text-admin-text hover:bg-admin-muted",
                                        isSelected && "bg-admin-primary font-semibold text-white",
                                        isToday && !isSelected && "ring-1 ring-admin-primary/40",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    {format(day, "d")}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
