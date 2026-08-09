"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "10", "20", "30", "40", "50"] as const;
const EMPTY = "";

const ITEM_H = 36;
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
const PAD_Y = ITEM_H * Math.floor(VISIBLE_ROWS / 2);

export function formatDeliveryClockTime(value?: string | null): string | null {
    if (!value) {
        return null;
    }
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
        return null;
    }
    return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Приводит HH:mm к ближайшим минутам, кратным 10. */
export function snapDeliveryClockToTenMinutes(value?: string | null): string {
    const formatted = formatDeliveryClockTime(value);
    if (!formatted) {
        return "";
    }
    const [hRaw, mRaw] = formatted.split(":");
    let hour = Number(hRaw);
    let minute = Math.round(Number(mRaw) / 10) * 10;
    if (minute === 60) {
        minute = 0;
        hour = (hour + 1) % 24;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export const DELIVERY_TIME_PRESETS = [
    { label: "14–17", from: "14:00", to: "17:00" },
    { label: "18–23", from: "18:00", to: "23:00" },
] as const;

type DeliveryTimePresetsProps = {
    from: string;
    to: string;
    onSelectAction: (from: string, to: string) => void;
    disabled?: boolean;
    className?: string;
};

/** Быстрый выбор предустановленных интервалов «с–по». */
export function AdminDeliveryTimePresets({
    from,
    to,
    onSelectAction,
    disabled = false,
    className = "",
}: DeliveryTimePresetsProps) {
    const activeFrom = snapDeliveryClockToTenMinutes(from);
    const activeTo = snapDeliveryClockToTenMinutes(to);

    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {DELIVERY_TIME_PRESETS.map((preset) => {
                const selected = activeFrom === preset.from && activeTo === preset.to;
                return (
                    <button
                        key={preset.label}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelectAction(preset.from, preset.to)}
                        className={`rounded-lg border px-2.5 py-1 text-sm tabular-nums transition disabled:opacity-50 ${
                            selected
                                ? "border-admin-primary/40 bg-admin-primary/10 font-medium text-admin-primary"
                                : "border-admin-border bg-admin-surface text-admin-text hover:bg-admin-muted"
                        }`}
                    >
                        {preset.label}
                    </button>
                );
            })}
        </div>
    );
}

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
};

type WheelColumnProps = {
    options: readonly string[];
    value: string;
    ariaLabel: string;
    disabled?: boolean;
    onChangeAction: (next: string) => void;
};

function WheelColumn({ options, value, ariaLabel, disabled = false, onChangeAction }: WheelColumnProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressEmitRef = useRef(false);
    const lastWheelStepAtRef = useRef(0);
    const valueRef = useRef(value);
    valueRef.current = value;

    const scrollToValue = useCallback(
        (next: string, smooth: boolean) => {
            const el = scrollerRef.current;
            if (!el) return;
            const idx = Math.max(0, options.indexOf(next));
            const top = idx * ITEM_H;
            suppressEmitRef.current = true;
            el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
            window.setTimeout(() => {
                suppressEmitRef.current = false;
            }, smooth ? 280 : 40);
        },
        [options],
    );

    const stepBy = useCallback(
        (dir: 1 | -1) => {
            if (disabled) return;
            const current = valueRef.current;
            const idx = Math.max(0, options.indexOf(current));
            const nextIdx = Math.max(0, Math.min(options.length - 1, idx + dir));
            const next = options[nextIdx];
            if (next === undefined || next === current) return;
            scrollToValue(next, true);
            onChangeAction(next);
        },
        [disabled, onChangeAction, options, scrollToValue],
    );

    useLayoutEffect(() => {
        scrollToValue(value, false);
    }, [scrollToValue, value]);

    const settle = useCallback(() => {
        const el = scrollerRef.current;
        if (!el || disabled || suppressEmitRef.current) return;
        const rawIdx = Math.round(el.scrollTop / ITEM_H);
        const idx = Math.max(0, Math.min(options.length - 1, rawIdx));
        const next = options[idx] ?? EMPTY;
        const targetTop = idx * ITEM_H;
        if (Math.abs(el.scrollTop - targetTop) > 1) {
            el.scrollTo({ top: targetTop, behavior: "smooth" });
        }
        if (next !== value) {
            onChangeAction(next);
        }
    }, [disabled, onChangeAction, options, value]);

    const onScroll = () => {
        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
        }
        settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            settle();
        }, 80);
    };

    // Только для Windows/Linux + колёсико мыши: шаг на 1.
    // На Mac / тачпаде оставляем нативную плавную прокрутку.
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el || disabled) return;

        const platform = navigator.platform || "";
        const ua = navigator.userAgent || "";
        const isApple = /Mac|iPhone|iPad|iPod/i.test(platform) || /Macintosh/.test(ua);
        if (isApple) return;

        const onWheel = (e: WheelEvent) => {
            // Precision touchpad: мелкие пиксельные дельты — не трогаем.
            if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            if (now - lastWheelStepAtRef.current < 55) return;
            lastWheelStepAtRef.current = now;
            stepBy(e.deltaY > 0 ? 1 : -1);
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", onWheel);
        };
    }, [disabled, stepBy]);

    useEffect(() => {
        return () => {
            if (settleTimerRef.current) {
                clearTimeout(settleTimerRef.current);
            }
        };
    }, []);

    return (
        <div
            ref={scrollerRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onScroll={onScroll}
            className={`h-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                disabled ? "pointer-events-none opacity-50" : ""
            }`}
            style={{ scrollSnapType: "y mandatory" }}
        >
            <div style={{ height: PAD_Y }} aria-hidden />
            {options.map((opt) => {
                const selected = opt === value;
                const label = opt === EMPTY ? "—" : opt;
                return (
                    <button
                        key={opt === EMPTY ? "empty" : opt}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={disabled}
                        onClick={() => {
                            if (disabled) return;
                            scrollToValue(opt, true);
                            onChangeAction(opt);
                        }}
                        className={`flex w-full snap-center items-center justify-center text-[17px] tabular-nums transition-colors ${
                            selected ? "font-semibold text-admin-text" : "font-normal text-admin-text-secondary/70"
                        }`}
                        style={{ height: ITEM_H }}
                    >
                        {label}
                    </button>
                );
            })}
            <div style={{ height: PAD_Y }} aria-hidden />
        </div>
    );
}

/**
 * iOS-like scroll picker: минуты 00 / 10 / 20 / 30 / 40 / 50.
 * Пустое value = «—» в обоих барабанах.
 */
export default function AdminDeliveryTimeInput({
    value,
    onChangeAction,
    id,
    disabled = false,
    className = "",
}: Props) {
    const snapped = value ? snapDeliveryClockToTenMinutes(value) : "";
    const [hour, minute] = snapped ? snapped.split(":") : [EMPTY, EMPTY];

    const hourOptions = [EMPTY, ...HOURS];
    const minuteOptions = [EMPTY, ...MINUTES];

    const emit = (nextHour: string, nextMinute: string) => {
        if (nextHour === EMPTY && nextMinute === EMPTY) {
            onChangeAction("");
            return;
        }
        if (nextHour === EMPTY || nextMinute === EMPTY) {
            // Пока крутят один барабан — держим вторую часть или ставим 00.
            const h = nextHour === EMPTY ? hour || "00" : nextHour;
            const m = nextMinute === EMPTY ? minute || "00" : nextMinute;
            if (h === EMPTY || m === EMPTY) {
                onChangeAction("");
                return;
            }
            onChangeAction(`${h}:${m}`);
            return;
        }
        onChangeAction(`${nextHour}:${nextMinute}`);
    };

    return (
        <div id={id} className={`w-full min-w-[9.5rem] ${className}`}>
            <div
                className="relative overflow-hidden rounded-2xl border border-admin-border bg-[#f2f2f7]"
                style={{ height: WHEEL_H }}
            >
                {/* Выделенная полоса по центру */}
                <div
                    className="pointer-events-none absolute inset-x-2 z-[1] rounded-lg border border-black/5 bg-white/55 shadow-sm"
                    style={{ top: PAD_Y, height: ITEM_H }}
                    aria-hidden
                />

                <div className="relative z-0 flex h-full">
                    <WheelColumn
                        options={hourOptions}
                        value={hour}
                        ariaLabel="Часы"
                        disabled={disabled}
                        onChangeAction={(next) => emit(next, minute === EMPTY && next !== EMPTY ? "00" : minute)}
                    />
                    <div
                        className="pointer-events-none flex w-3 shrink-0 items-center justify-center text-[17px] font-semibold text-admin-text"
                        aria-hidden
                    >
                        :
                    </div>
                    <WheelColumn
                        options={minuteOptions}
                        value={minute}
                        ariaLabel="Минуты"
                        disabled={disabled}
                        onChangeAction={(next) => emit(hour === EMPTY && next !== EMPTY ? "00" : hour, next)}
                    />
                </div>

                {/* Градиенты сверху/снизу как у iOS */}
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-[2] bg-gradient-to-b from-[#f2f2f7] via-[#f2f2f7]/85 to-transparent"
                    style={{ height: PAD_Y }}
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-[#f2f2f7] via-[#f2f2f7]/85 to-transparent"
                    style={{ height: PAD_Y }}
                    aria-hidden
                />
            </div>
            {snapped ? (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChangeAction("")}
                    className="mt-1 text-[11px] text-admin-text-secondary underline decoration-admin-border underline-offset-2 hover:text-admin-text disabled:opacity-50"
                >
                    Очистить
                </button>
            ) : null}
        </div>
    );
}
