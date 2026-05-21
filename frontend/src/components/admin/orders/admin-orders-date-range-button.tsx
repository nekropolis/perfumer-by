"use client";

import { CalendarRange } from "lucide-react";
import { createPortal } from "react-dom";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState } from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

type Preset = { value: string; label: string };

export type DateRangeValue = {
    period: string;
    dateFrom: string;
    dateTo: string;
};

type Props = {
    presets: Preset[];
    value: DateRangeValue;
    onApplyAction: (next: DateRangeValue) => void;
    className?: string;
    /** Только попап и ref — без кнопки в тулбаре (открытие из заголовка таблицы). */
    hideTrigger?: boolean;
};

export type AdminOrdersDateRangeButtonHandle = {
    open: () => void;
};

/** Подпись активного фильтра по датам (пресет или ручной интервал), для кнопки и заголовка таблицы. */
export function getAdminOrdersDateFilterLabel(presets: Preset[], v: DateRangeValue): string {
    const manual = Boolean(v.dateFrom.trim()) || Boolean(v.dateTo.trim());
    if (manual) {
        const a = v.dateFrom.trim();
        const b = v.dateTo.trim();
        const fmt = (iso: string) => format(parseISO(`${iso}T12:00:00`), "d MMM yyyy", { locale: ru });
        if (a && b) {
            return `${fmt(a)} — ${fmt(b)}`;
        }
        if (a) {
            return `С ${fmt(a)}`;
        }
        return `По ${fmt(b)}`;
    }
    const p = v.period.trim();
    if (p) {
        return presets.find((x) => x.value === p)?.label ?? p;
    }
    return "Все даты";
}

const AdminOrdersDateRangeButton = forwardRef<AdminOrdersDateRangeButtonHandle, Props>(function AdminOrdersDateRangeButton(
    { presets, value, onApplyAction, className = "", hideTrigger = false },
    ref,
) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [draftPeriod, setDraftPeriod] = useState("");
    const [draftFrom, setDraftFrom] = useState("");
    const [draftTo, setDraftTo] = useState("");

    const openPopup = useCallback(() => {
        setDraftPeriod(value.period);
        setDraftFrom(value.dateFrom);
        setDraftTo(value.dateTo);
        setOpen(true);
    }, [value.period, value.dateFrom, value.dateTo]);

    useImperativeHandle(
        ref,
        () => ({
            open: () => {
                openPopup();
            },
        }),
        [openPopup],
    );

    useEffect(() => {
        if (!open) {
            return;
        }
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const applyDraftDatesAndClose = () => {
        const manual = Boolean(draftFrom.trim()) || Boolean(draftTo.trim());
        onApplyAction({
            period: manual ? "" : draftPeriod,
            dateFrom: draftFrom.trim(),
            dateTo: draftTo.trim(),
        });
        setOpen(false);
    };

    const pickPreset = (period: string) => {
        onApplyAction({ period, dateFrom: "", dateTo: "" });
        setOpen(false);
    };

    const clearAllAndClose = () => {
        onApplyAction({ period: "", dateFrom: "", dateTo: "" });
        setOpen(false);
    };

    const popup =
        open ? (
            <div
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16 sm:pt-24"
                role="presentation"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                        setOpen(false);
                    }
                }}
            >
                <div
                    id={`${id}-panel`}
                    role="dialog"
                    aria-modal="true"
                    {...(hideTrigger
                        ? { "aria-label": "Фильтр по дате создания заказа" }
                        : { "aria-labelledby": `${id}-trigger` })}
                    className="w-full max-w-md rounded-2xl border border-admin-border bg-white shadow-xl"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="max-h-[min(85vh,560px)] overflow-y-auto p-4 sm:p-5">
                        <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-admin-text-secondary">Быстрый выбор</div>
                        <div className="mb-4 flex flex-wrap gap-1.5">
                            {presets.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => pickPreset(p.value)}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                        value.period === p.value && !value.dateFrom && !value.dateTo
                                            ? "border-gray-900 bg-admin-primary text-white"
                                            : "border-admin-border bg-admin-muted text-admin-text hover:border-gray-300 hover:bg-white"
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => pickPreset("")}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                    !value.period && !value.dateFrom && !value.dateTo
                                        ? "border-gray-900 bg-admin-primary text-white"
                                        : "border-admin-border bg-admin-muted text-admin-text hover:border-gray-300 hover:bg-white"
                                }`}
                            >
                                Все даты
                            </button>
                        </div>

                        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-admin-text-secondary">Интервал дат</div>
                        <div className="mb-3 rounded-lg border border-admin-border bg-admin-muted px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-admin-text-secondary">Сегодня</div>
                            <div className="text-sm font-medium text-admin-text">
                                {format(new Date(), "EEEE, d MMMM yyyy", { locale: ru })}
                            </div>
                        </div>
                        <p className="mb-3 text-xs leading-relaxed text-admin-text-secondary">
                            Достаточно одной границы — только «С» или только «По». Как только меняете дату вручную, быстрый пресет
                            сбрасывается.
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="text-xs font-medium text-admin-text-secondary">С</span>
                                <input
                                    type="date"
                                    value={draftFrom}
                                    onChange={(e) => {
                                        setDraftFrom(e.target.value);
                                        setDraftPeriod("");
                                    }}
                                    className="w-full rounded-lg border border-admin-border bg-white px-2 py-2 text-sm text-admin-text outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                                />
                            </label>
                            <label className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="text-xs font-medium text-admin-text-secondary">По</span>
                                <input
                                    type="date"
                                    value={draftTo}
                                    onChange={(e) => {
                                        setDraftTo(e.target.value);
                                        setDraftPeriod("");
                                    }}
                                    className="w-full rounded-lg border border-admin-border bg-white px-2 py-2 text-sm text-admin-text outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                                />
                            </label>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-admin-border pt-3">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-md px-3 py-1.5 text-sm text-admin-text hover:bg-admin-muted"
                            >
                                Закрыть
                            </button>
                            <button
                                type="button"
                                onClick={clearAllAndClose}
                                className="rounded-md px-3 py-1.5 text-sm text-admin-text hover:bg-admin-muted"
                            >
                                Сбросить
                            </button>
                            <button
                                type="button"
                                onClick={applyDraftDatesAndClose}
                                className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-admin-primary-hover"
                            >
                                Применить
                            </button>
                        </div>
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
                    title="Фильтр по дате создания заказа"
                    className="inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-left text-xs font-medium text-admin-text shadow-sm transition hover:border-gray-300 hover:bg-admin-muted focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:max-w-[13rem]"
                >
                    <CalendarRange className="h-3.5 w-3.5 shrink-0 text-admin-text-secondary" aria-hidden />
                    <span className="min-w-0 truncate">{getAdminOrdersDateFilterLabel(presets, value)}</span>
                </button>
            )}
            {typeof document !== "undefined" && popup ? createPortal(popup, document.body) : null}
        </div>
    );
});

export default AdminOrdersDateRangeButton;
