"use client";

import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import {
    forwardRef,
    useCallback,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getMonth,
    getYear,
    isAfter,
    isBefore,
    isSameDay,
    isSameMonth,
    isWithinInterval,
    parseISO,
    setMonth,
    setYear,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";

type Preset = { value: string; label: string };

export type DateRangeValue = {
    period: string;
    dateFrom: string;
    dateTo: string;
};

type Props = {
    /** @deprecated Пресеты убраны из UI; проп оставлен для совместимости. */
    presets?: Preset[];
    value: DateRangeValue;
    onApplyAction: (next: DateRangeValue) => void;
    className?: string;
    /** Только попап и ref — без кнопки в тулбаре (открытие из заголовка таблицы). */
    hideTrigger?: boolean;
};

export type AdminOrdersDateRangeButtonHandle = {
    open: () => void;
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WHEEL_ITEM_HEIGHT = 40;
const YEAR_SPAN = 8;

type PanelMode = "days" | "wheels";

type WheelItem = {
    value: number;
    label: string;
};

function parseIso(value: string): Date | null {
    if (!value.trim()) return null;
    try {
        const d = parseISO(`${value}T12:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
}

function toIso(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

function formatDisplayDate(iso: string): string {
    const d = parseIso(iso);
    if (!d) return "";
    return format(d, "dd.MM.yyyy");
}

/** Подпись активного фильтра по датам (пресет или ручной интервал). */
export function getAdminOrdersDateFilterLabel(presets: Preset[], v: DateRangeValue): string {
    const a = v.dateFrom.trim();
    const b = v.dateTo.trim();
    if (a || b) {
        const fmt = (iso: string) => format(parseISO(`${iso}T12:00:00`), "d MMM yyyy", { locale: ru });
        if (a && b) {
            if (a === b) return fmt(a);
            return `${fmt(a)} — ${fmt(b)}`;
        }
        if (a) return `С ${fmt(a)}`;
        return `По ${fmt(b)}`;
    }
    const p = v.period.trim();
    if (p) {
        return presets.find((x) => x.value === p)?.label ?? p;
    }
    return "Все даты";
}

function WheelColumn({
    items,
    selectedValue,
    onSelectAction,
    ariaLabel,
}: {
    items: WheelItem[];
    selectedValue: number;
    onSelectAction: (value: number) => void;
    ariaLabel: string;
}) {
    const scrollRef = useRef<HTMLUListElement>(null);
    const scrollEndTimerRef = useRef<number | null>(null);
    const isProgrammaticScrollRef = useRef(false);

    const scrollToValue = useCallback(
        (value: number, smooth: boolean) => {
            const el = scrollRef.current;
            if (!el) return;
            const index = items.findIndex((item) => item.value === value);
            if (index < 0) return;
            isProgrammaticScrollRef.current = true;
            el.scrollTo({
                top: index * WHEEL_ITEM_HEIGHT,
                behavior: smooth ? "smooth" : "auto",
            });
            window.setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, smooth ? 220 : 0);
        },
        [items],
    );

    useEffect(() => {
        scrollToValue(selectedValue, false);
    }, [selectedValue, scrollToValue]);

    const syncFromScroll = useCallback(() => {
        if (isProgrammaticScrollRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        const index = Math.min(
            items.length - 1,
            Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT)),
        );
        const item = items[index];
        if (item && item.value !== selectedValue) {
            onSelectAction(item.value);
        }
    }, [items, onSelectAction, selectedValue]);

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
                className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-lg border border-admin-primary/25 bg-admin-primary/10"
                aria-hidden
            />
            <ul
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-[200px] overflow-y-auto overscroll-y-contain py-[80px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
            >
                {items.map((item) => {
                    const isSelected = item.value === selectedValue;
                    return (
                        <li
                            key={item.value}
                            className={`flex h-10 shrink-0 snap-center items-center justify-center px-2 text-center text-sm capitalize transition ${
                                isSelected ? "font-semibold text-admin-primary" : "text-admin-text"
                            }`}
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

const AdminOrdersDateRangeButton = forwardRef<AdminOrdersDateRangeButtonHandle, Props>(
    function AdminOrdersDateRangeButton(
        { presets = [], value, onApplyAction, className = "", hideTrigger = false },
        ref,
    ) {
        const id = useId();
        const [open, setOpen] = useState(false);
        const [panelMode, setPanelMode] = useState<PanelMode>("days");
        const [draftFrom, setDraftFrom] = useState("");
        const [draftTo, setDraftTo] = useState("");
        const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
        const [wheelMonth, setWheelMonth] = useState(() => getMonth(new Date()));
        const [wheelYear, setWheelYear] = useState(() => getYear(new Date()));

        const today = startOfDay(new Date());
        const fromDate = parseIso(draftFrom);
        const toDate = parseIso(draftTo);

        const openPopup = useCallback(() => {
            setDraftFrom(value.dateFrom);
            setDraftTo(value.dateTo);
            setPanelMode("days");
            const anchor =
                parseIso(value.dateFrom) ||
                parseIso(value.dateTo) ||
                new Date();
            setViewMonth(startOfMonth(anchor));
            setOpen(true);
        }, [value.dateFrom, value.dateTo]);

        useImperativeHandle(
            ref,
            () => ({
                open: () => openPopup(),
            }),
            [openPopup],
        );

        useEffect(() => {
            if (!open) return;
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    if (panelMode === "wheels") {
                        setPanelMode("days");
                        return;
                    }
                    setOpen(false);
                }
            };
            window.addEventListener("keydown", onKey);
            return () => {
                document.body.style.overflow = prevOverflow;
                window.removeEventListener("keydown", onKey);
            };
        }, [open, panelMode]);

        useEffect(() => {
            if (panelMode === "wheels") {
                setWheelMonth(getMonth(viewMonth));
                setWheelYear(getYear(viewMonth));
            }
        }, [panelMode, viewMonth]);

        const monthStart = startOfMonth(viewMonth);
        const monthEnd = endOfMonth(viewMonth);
        const calendarDays = eachDayOfInterval({
            start: startOfWeek(monthStart, { weekStartsOn: 1 }),
            end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
        });

        const yearOptions = useMemo(() => {
            const y = getYear(today);
            return Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => y - YEAR_SPAN + i);
        }, [today]);

        const monthWheelItems: WheelItem[] = useMemo(
            () =>
                Array.from({ length: 12 }, (_, monthIndex) => ({
                    value: monthIndex,
                    label: format(setMonth(new Date(2020, 0, 1), monthIndex), "LLLL", { locale: ru }),
                })),
            [],
        );

        const yearWheelItems: WheelItem[] = useMemo(
            () => yearOptions.map((year) => ({ value: year, label: String(year) })),
            [yearOptions],
        );

        const pickDay = (day: Date) => {
            const iso = toIso(day);

            // Пусто → одна дата
            if (!fromDate && !toDate) {
                setDraftFrom(iso);
                setDraftTo("");
                return;
            }

            const hasFullRange = Boolean(fromDate && toDate && !isSameDay(fromDate, toDate));
            const singleDate = fromDate && (!toDate || isSameDay(fromDate, toDate)) ? fromDate : null;

            // Одна дата → второй клик строит интервал
            if (singleDate && !hasFullRange) {
                if (isSameDay(day, singleDate)) {
                    setDraftFrom(iso);
                    setDraftTo("");
                    return;
                }
                if (isBefore(day, singleDate)) {
                    setDraftFrom(iso);
                    setDraftTo(toIso(singleDate));
                    return;
                }
                setDraftFrom(toIso(singleDate));
                setDraftTo(iso);
                return;
            }

            // Полный интервал (start–end)
            if (fromDate && toDate) {
                const start = isBefore(fromDate, toDate) ? fromDate : toDate;
                const end = isBefore(fromDate, toDate) ? toDate : fromDate;

                // Клик по краю → убрать этот край, оставить другой как одну дату
                if (isSameDay(day, start)) {
                    setDraftFrom(toIso(end));
                    setDraftTo("");
                    return;
                }
                if (isSameDay(day, end)) {
                    setDraftFrom(toIso(start));
                    setDraftTo("");
                    return;
                }
                // До начала → сдвигаем начало
                if (isBefore(day, start)) {
                    setDraftFrom(iso);
                    setDraftTo(toIso(end));
                    return;
                }
                // После конца или внутри → сдвигаем конец (6–16 + 15 → 6–15; 6–16 + 20 → 6–20)
                setDraftFrom(toIso(start));
                setDraftTo(iso);
            }
        };

        const isRangeStart = (day: Date) => {
            if (!fromDate) return false;
            if (!toDate || isSameDay(fromDate, toDate)) return isSameDay(day, fromDate);
            const start = isBefore(fromDate, toDate) ? fromDate : toDate;
            return isSameDay(day, start);
        };
        const isRangeEnd = (day: Date) => {
            if (!fromDate || !toDate || isSameDay(fromDate, toDate)) return false;
            const end = isBefore(fromDate, toDate) ? toDate : fromDate;
            return isSameDay(day, end);
        };
        const isInRange = (day: Date) => {
            if (!fromDate || !toDate || isSameDay(fromDate, toDate)) return false;
            const start = isBefore(fromDate, toDate) ? fromDate : toDate;
            const end = isBefore(fromDate, toDate) ? toDate : fromDate;
            return isWithinInterval(day, { start, end });
        };

        const applyAndClose = () => {
            let a = draftFrom.trim();
            let b = draftTo.trim();
            if (a && !b) {
                b = a;
            } else if (!a && b) {
                a = b;
            }
            if (a && b && a > b) {
                const tmp = a;
                a = b;
                b = tmp;
            }
            onApplyAction({
                period: "",
                dateFrom: a,
                dateTo: b,
            });
            setOpen(false);
        };

        const clearDraft = () => {
            setDraftFrom("");
            setDraftTo("");
        };

        const clearAllAndClose = () => {
            onApplyAction({ period: "", dateFrom: "", dateTo: "" });
            setOpen(false);
        };

        const applyWheelSelection = () => {
            setViewMonth(startOfMonth(setYear(setMonth(new Date(2020, 0, 1), wheelMonth), wheelYear)));
            setPanelMode("days");
        };

        const footerLabel = (() => {
            if (draftFrom && draftTo) {
                if (draftFrom === draftTo) return formatDisplayDate(draftFrom);
                return `${formatDisplayDate(draftFrom)} –\n${formatDisplayDate(draftTo)}`;
            }
            if (draftFrom) return formatDisplayDate(draftFrom);
            if (draftTo) return formatDisplayDate(draftTo);
            return "Дата доставки";
        })();

        const popup = open ? (
            <div
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16 sm:pt-24"
                role="presentation"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setOpen(false);
                }}
            >
                <div
                    id={`${id}-panel`}
                    role="dialog"
                    aria-modal="true"
                    {...(hideTrigger
                        ? { "aria-label": "Фильтр по дате доставки" }
                        : { "aria-labelledby": `${id}-trigger` })}
                    className="w-full max-w-[22rem] rounded-2xl border border-admin-border bg-white shadow-xl"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="max-h-[min(85vh,560px)] overflow-y-auto p-4 sm:p-5">
                        {panelMode === "wheels" ? (
                            <div>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPanelMode("days")}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                        aria-label="Назад к календарю"
                                    >
                                        <ChevronLeft className="h-4 w-4" aria-hidden />
                                    </button>
                                    <div className="text-center text-sm font-semibold capitalize text-admin-text">
                                        {format(
                                            setYear(setMonth(new Date(2020, 0, 1), wheelMonth), wheelYear),
                                            "LLLL yyyy",
                                            { locale: ru },
                                        )}
                                    </div>
                                    <div className="h-8 w-8 shrink-0" aria-hidden />
                                </div>
                                <div className="relative flex gap-1 rounded-xl bg-admin-muted p-2">
                                    <WheelColumn
                                        items={monthWheelItems}
                                        selectedValue={wheelMonth}
                                        onSelectAction={setWheelMonth}
                                        ariaLabel="Месяц"
                                    />
                                    <WheelColumn
                                        items={yearWheelItems}
                                        selectedValue={wheelYear}
                                        onSelectAction={setWheelYear}
                                        ariaLabel="Год"
                                    />
                                </div>
                                <div className="mt-3 flex justify-end border-t border-admin-border pt-3">
                                    <button
                                        type="button"
                                        onClick={applyWheelSelection}
                                        className="rounded-lg bg-admin-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-admin-primary-hover"
                                    >
                                        Готово
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setViewMonth((m) => subMonths(m, 1))}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text transition hover:bg-admin-muted"
                                        aria-label="Предыдущий месяц"
                                    >
                                        <ChevronLeft className="h-4 w-4" aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPanelMode("wheels")}
                                        className="rounded-lg px-2 py-1 text-sm font-semibold capitalize text-admin-text transition hover:bg-admin-muted"
                                        aria-label="Выбрать месяц и год"
                                    >
                                        {format(viewMonth, "LLLL yyyy 'г.'", { locale: ru })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMonth((m) => addMonths(m, 1))}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text transition hover:bg-admin-muted"
                                        aria-label="Следующий месяц"
                                    >
                                        <ChevronRight className="h-4 w-4" aria-hidden />
                                    </button>
                                </div>

                                <div className="mb-1 grid grid-cols-7 gap-1">
                                    {WEEKDAYS.map((label) => (
                                        <div
                                            key={label}
                                            className="py-1 text-center text-[11px] font-medium text-admin-text-secondary"
                                        >
                                            {label}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map((day) => {
                                        const inMonth = isSameMonth(day, viewMonth);
                                        const start = isRangeStart(day);
                                        const end = isRangeEnd(day);
                                        const selectedEdge =
                                            start ||
                                            end ||
                                            (fromDate &&
                                                (!toDate || isSameDay(fromDate, toDate)) &&
                                                isSameDay(day, fromDate));
                                        const inMiddle = isInRange(day) && !selectedEdge;
                                        const isToday = isSameDay(day, today);

                                        return (
                                            <button
                                                key={day.toISOString()}
                                                type="button"
                                                onClick={() => pickDay(day)}
                                                className={[
                                                    "flex h-9 w-full items-center justify-center rounded-md text-sm transition",
                                                    !inMonth && !selectedEdge && !inMiddle && "text-admin-text-muted/45",
                                                    inMonth &&
                                                        !selectedEdge &&
                                                        !inMiddle &&
                                                        !isToday &&
                                                        "bg-admin-muted/50 text-admin-text hover:bg-admin-muted",
                                                    inMiddle && "bg-admin-primary/20 font-medium text-admin-text",
                                                    selectedEdge &&
                                                        "bg-admin-primary font-bold text-white shadow-sm ring-1 ring-admin-primary/40",
                                                    isToday &&
                                                        !selectedEdge &&
                                                        "bg-admin-muted font-bold text-admin-primary ring-2 ring-inset ring-admin-primary",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                            >
                                                {format(day, "d")}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-4 flex items-end justify-between gap-3 border-t border-admin-border pt-3">
                                    <div className="min-w-0 whitespace-pre-line text-xs leading-snug text-admin-text-secondary">
                                        {footerLabel}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                clearDraft();
                                                clearAllAndClose();
                                            }}
                                            className="px-2 py-1.5 text-sm font-semibold text-admin-text hover:underline"
                                        >
                                            Сброс
                                        </button>
                                        <button
                                            type="button"
                                            onClick={applyAndClose}
                                            className="rounded-lg bg-admin-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-admin-primary-hover"
                                        >
                                            OK
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ) : null;

        const rootClass = hideTrigger ? `hidden ${className}`.trim() : `shrink-0 ${className}`.trim();

        return (
            <div className={rootClass}>
                {hideTrigger ? null : (
                    <button
                        type="button"
                        id={`${id}-trigger`}
                        aria-expanded={open}
                        aria-haspopup="dialog"
                        aria-controls={`${id}-panel`}
                        onClick={() => {
                            if (open) {
                                setOpen(false);
                                return;
                            }
                            openPopup();
                        }}
                        title="Фильтр по дате доставки"
                        className="inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-left text-xs font-medium text-admin-text shadow-sm transition hover:border-gray-300 hover:bg-admin-muted focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:max-w-[13rem]"
                    >
                        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-admin-text-secondary" aria-hidden />
                        <span className="min-w-0 truncate">{getAdminOrdersDateFilterLabel(presets, value)}</span>
                    </button>
                )}
                {typeof document !== "undefined" && popup ? createPortal(popup, document.body) : null}
            </div>
        );
    },
);

export default AdminOrdersDateRangeButton;
