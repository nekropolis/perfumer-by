"use client";

import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getMonth,
    getYear,
    isAfter,
    isSameDay,
    isSameMonth,
    parseISO,
    setMonth,
    setYear,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { siteBtnPrimary, siteBtnSecondary } from "@/lib/site-ui-classes";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WHEEL_ITEM_HEIGHT = 40;
const YEAR_SPAN = 120;

type PanelMode = "days" | "wheels";

type WheelItem = {
    value: number;
    label: string;
    disabled?: boolean;
};

type SiteDatePickerProps = {
    value: string;
    onChangeAction: (value: string) => void;
    className?: string;
    placeholder?: string;
    maxDate?: Date;
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

function clampViewMonth(date: Date, max: Date): Date {
    const capped = isAfter(date, max) ? max : date;
    return startOfMonth(capped);
}

type WheelColumnProps = {
    items: WheelItem[];
    selectedValue: number;
    onSelectAction: (value: number) => void;
    ariaLabel: string;
};

function WheelColumn({ items, selectedValue, onSelectAction, ariaLabel }: WheelColumnProps) {
    const scrollRef = useRef<HTMLUListElement>(null);
    const scrollEndTimerRef = useRef<number | null>(null);
    const isProgrammaticScrollRef = useRef(false);

    const scrollToValue = useCallback(
        (value: number, smooth: boolean) => {
            const el = scrollRef.current;
            if (!el) {
                return;
            }

            const index = items.findIndex((item) => item.value === value && !item.disabled);
            const targetIndex = index >= 0 ? index : items.findIndex((item) => !item.disabled);
            if (targetIndex < 0) {
                return;
            }

            isProgrammaticScrollRef.current = true;
            el.scrollTo({
                top: targetIndex * WHEEL_ITEM_HEIGHT,
                behavior: smooth ? "smooth" : "auto",
            });
            window.setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, smooth ? 220 : 0);
        },
        [items]
    );

    useEffect(() => {
        scrollToValue(selectedValue, false);
    }, [selectedValue, scrollToValue]);

    const syncFromScroll = useCallback(() => {
        if (isProgrammaticScrollRef.current) {
            return;
        }

        const el = scrollRef.current;
        if (!el) {
            return;
        }

        const index = Math.min(
            items.length - 1,
            Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT))
        );
        const item = items[index];
        if (!item || item.disabled) {
            const nearest = [...items]
                .map((entry, entryIndex) => ({ entry, entryIndex }))
                .filter(({ entry }) => !entry.disabled)
                .sort(
                    (a, b) =>
                        Math.abs(a.entryIndex - index) - Math.abs(b.entryIndex - index)
                )[0];
            if (nearest) {
                scrollToValue(nearest.entry.value, true);
            }
            return;
        }

        if (item.value !== selectedValue) {
            onSelectAction(item.value);
        }
    }, [items, onSelectAction, scrollToValue, selectedValue]);

    const handleScroll = () => {
        if (scrollEndTimerRef.current !== null) {
            window.clearTimeout(scrollEndTimerRef.current);
        }
        scrollEndTimerRef.current = window.setTimeout(() => {
            scrollEndTimerRef.current = null;
            syncFromScroll();
        }, 80);
    };

    useEffect(() => {
        return () => {
            if (scrollEndTimerRef.current !== null) {
                window.clearTimeout(scrollEndTimerRef.current);
            }
        };
    }, []);

    return (
        <div className="relative min-w-0 flex-1" aria-label={ariaLabel}>
            <div
                className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-2xl border border-[var(--accent-soft)] bg-[var(--accent)]/10"
                aria-hidden
            />

            <ul
                ref={scrollRef}
                onScroll={handleScroll}
                className="site-date-wheel-scroll h-[200px] overflow-y-auto overscroll-y-contain py-[80px]"
                style={{
                    scrollSnapType: "y mandatory",
                    WebkitOverflowScrolling: "touch",
                }}
            >
                {items.map((item) => {
                    const isSelected = item.value === selectedValue && !item.disabled;

                    return (
                        <li
                            key={item.value}
                            className={[
                                "flex h-10 shrink-0 snap-center items-center justify-center px-2 text-center text-sm transition",
                                item.disabled
                                    ? "cursor-not-allowed text-[var(--text-secondary)] opacity-30"
                                    : isSelected
                                      ? "font-semibold text-[var(--accent)]"
                                      : "text-[var(--foreground)]",
                            ].join(" ")}
                            style={{ scrollSnapAlign: "center" }}
                        >
                            {item.label}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default function SiteDatePicker({
    value,
    onChangeAction,
    className = "",
    placeholder = "Выберите дату",
    maxDate,
    disabled = false,
}: SiteDatePickerProps) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [panelMode, setPanelMode] = useState<PanelMode>("days");

    const selected = parseValue(value);
    const max = startOfDay(maxDate ?? new Date());
    const maxYear = getYear(max);
    const maxMonth = getMonth(max);

    const [viewMonth, setViewMonth] = useState(() => clampViewMonth(selected ?? max, max));
    const [wheelMonth, setWheelMonth] = useState(() => getMonth(viewMonth));
    const [wheelYear, setWheelYear] = useState(() => getYear(viewMonth));

    useEffect(() => {
        if (selected) {
            setViewMonth(clampViewMonth(selected, max));
        }
    }, [value, max]);

    useEffect(() => {
        if (!open) {
            setPanelMode("days");
        }
    }, [open]);

    useEffect(() => {
        if (panelMode === "wheels") {
            setWheelMonth(getMonth(viewMonth));
            setWheelYear(getYear(viewMonth));
        }
    }, [panelMode, viewMonth]);

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
                if (panelMode === "wheels") {
                    setPanelMode("days");
                    return;
                }
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, panelMode]);

    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const displayLabel = selected
        ? format(selected, "d MMMM yyyy", { locale: ru })
        : "";

    const pickDay = (day: Date) => {
        if (isAfter(day, max)) {
            return;
        }
        onChangeAction(toIsoDate(day));
        setOpen(false);
    };

    const clearDate = () => {
        onChangeAction("");
        setOpen(false);
    };

    const nextMonthDisabled = isAfter(startOfMonth(addMonths(viewMonth, 1)), startOfMonth(max));

    const monthWheelItems: WheelItem[] = Array.from({ length: 12 }, (_, monthIndex) => {
        const disabled = wheelYear === maxYear && monthIndex > maxMonth;
        return {
            value: monthIndex,
            label: format(setMonth(new Date(2020, 0, 1), monthIndex), "LLLL", { locale: ru }),
            disabled,
        };
    });

    const yearWheelItems: WheelItem[] = Array.from({ length: YEAR_SPAN + 1 }, (_, offset) => {
        const year = maxYear - offset;
        return {
            value: year,
            label: String(year),
        };
    });

    const applyWheelSelection = () => {
        let next = setYear(setMonth(new Date(2020, 0, 1), wheelMonth), wheelYear);
        if (wheelYear === maxYear && wheelMonth > maxMonth) {
            next = setMonth(next, maxMonth);
        }
        setViewMonth(clampViewMonth(next, max));
        setPanelMode("days");
    };

    const openWheels = () => {
        setWheelMonth(getMonth(viewMonth));
        setWheelYear(getYear(viewMonth));
        setPanelMode("wheels");
    };

    const handleWheelYearChange = (year: number) => {
        setWheelYear(year);
        if (year === maxYear && wheelMonth > maxMonth) {
            setWheelMonth(maxMonth);
        }
    };

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
                className={`${siteBtnSecondary} w-full justify-start gap-2 px-4 py-3 text-left`}
            >
                <Calendar className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
                <span className={displayLabel ? "" : "text-[var(--text-secondary)]"}>
                    {displayLabel || placeholder}
                </span>
            </button>

            {open ? (
                <div
                    id={`${id}-calendar`}
                    role="dialog"
                    aria-modal="false"
                    aria-label="Выбор даты"
                    className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_24px_70px_rgba(31,23,34,0.14)] sm:left-auto sm:right-0 sm:min-w-[18.5rem]"
                >
                    {panelMode === "wheels" ? (
                        <>
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPanelMode("days")}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[var(--line)] text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                    aria-label="Назад к календарю"
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden />
                                </button>

                                <div className="text-center text-sm font-semibold capitalize text-[var(--foreground)]">
                                    {format(setYear(setMonth(new Date(2020, 0, 1), wheelMonth), wheelYear), "LLLL yyyy", {
                                        locale: ru,
                                    })}
                                </div>

                                <div className="h-8 w-8 shrink-0" aria-hidden />
                            </div>

                            <div className="relative flex gap-1 rounded-2xl bg-[var(--background)] p-2">
                                <div
                                    className="pointer-events-none absolute inset-x-2 top-2 bottom-2 rounded-xl"
                                    style={{
                                        maskImage:
                                            "linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                                        WebkitMaskImage:
                                            "linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                                    }}
                                    aria-hidden
                                />

                                <WheelColumn
                                    items={monthWheelItems}
                                    selectedValue={wheelMonth}
                                    onSelectAction={setWheelMonth}
                                    ariaLabel="Месяц"
                                />

                                <WheelColumn
                                    items={yearWheelItems}
                                    selectedValue={wheelYear}
                                    onSelectAction={handleWheelYearChange}
                                    ariaLabel="Год"
                                />
                            </div>

                            <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-3">
                                <button
                                    type="button"
                                    onClick={applyWheelSelection}
                                    className={siteBtnPrimary}
                                >
                                    Готово
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setViewMonth((m) => subMonths(m, 1))}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[var(--line)] text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                    aria-label="Предыдущий месяц"
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden />
                                </button>

                                <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={openWheels}
                                        className="rounded-2xl px-2 py-1 text-sm font-semibold capitalize text-[var(--foreground)] underline decoration-[var(--accent-soft)] underline-offset-4 transition hover:bg-[var(--background)]"
                                        aria-label="Выбрать месяц"
                                    >
                                        {format(viewMonth, "LLLL", { locale: ru })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openWheels}
                                        className="rounded-2xl px-2 py-1 text-sm font-semibold text-[var(--foreground)] underline decoration-[var(--accent-soft)] underline-offset-4 transition hover:bg-[var(--background)]"
                                        aria-label="Выбрать год"
                                    >
                                        {format(viewMonth, "yyyy", { locale: ru })}
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                                    disabled={nextMonthDisabled}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[var(--line)] text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="Следующий месяц"
                                >
                                    <ChevronRight className="h-4 w-4" aria-hidden />
                                </button>
                            </div>

                            <div className="mb-1 grid grid-cols-7 gap-1">
                                {WEEKDAYS.map((label) => (
                                    <div
                                        key={label}
                                        className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]"
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-1">
                                {calendarDays.map((day) => {
                                    const inMonth = isSameMonth(day, viewMonth);
                                    const isSelected = selected ? isSameDay(day, selected) : false;
                                    const isToday = isSameDay(day, max);
                                    const isDayDisabled = isAfter(day, max) || !inMonth;

                                    return (
                                        <button
                                            key={day.toISOString()}
                                            type="button"
                                            disabled={isDayDisabled}
                                            onClick={() => pickDay(day)}
                                            className={[
                                                "flex h-9 w-9 items-center justify-center rounded-xl text-sm transition",
                                                !inMonth && "pointer-events-none invisible",
                                                inMonth &&
                                                    !isSelected &&
                                                    !isDayDisabled &&
                                                    "text-[var(--foreground)] hover:bg-[var(--background)]",
                                                isSelected &&
                                                    "bg-[var(--accent)] font-semibold text-[var(--background)] shadow-sm",
                                                isToday && !isSelected && "ring-1 ring-[var(--accent-soft)]",
                                                isDayDisabled &&
                                                    inMonth &&
                                                    "cursor-not-allowed text-[var(--text-secondary)] opacity-35",
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        >
                                            {format(day, "d")}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-3">
                                <button
                                    type="button"
                                    onClick={clearDate}
                                    className="rounded-2xl px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                >
                                    Очистить
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}
