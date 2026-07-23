"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    options: Option[];
    onChangeAction: (value: string) => void;
    disabled?: boolean;
    /** «text» — показывать только подпись статуса; дропдаун по клику (как у кнопки). */
    triggerVariant?: "default" | "text";
    /** Классы цвета текста для `triggerVariant="text"` (например из `getOrderStatusTableTextClass`). */
    triggerTextClassName?: string;
    widthClassName?: string;
    menuWidthClassName?: string;
};

export default function AdminStatusDropdown({
    value,
    options,
    onChangeAction,
    disabled = false,
    triggerVariant = "default",
    triggerTextClassName,
    widthClassName = "w-[168px]",
    menuWidthClassName = "w-[220px]",
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const currentLabel = useMemo(
        () => options.find((item) => item.value === value)?.label ?? value,
        [options, value]
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown, { passive: true });
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [isOpen]);

    const rootClassName =
        triggerVariant === "text"
            ? "relative inline-block align-middle max-w-full"
            : `relative inline-flex ${widthClassName}`;

    const defaultTrigger = (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={disabled}
            className="flex min-h-10 w-full items-center justify-between rounded-lg border border-admin-border bg-admin-surface px-3 text-left text-sm text-admin-text shadow-sm transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:bg-admin-muted disabled:text-admin-text-muted"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Статус"
        >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown
                className={`h-4 w-4 shrink-0 text-admin-text-muted transition ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    const textColorClass = triggerTextClassName?.trim() || "text-admin-text";

    const textTrigger = disabled ? (
        <span className={`text-sm font-medium ${textColorClass}`}>{currentLabel}</span>
    ) : (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`inline-flex max-w-full cursor-pointer items-center gap-1.5 border-x-0 border-t-0 border-b-2 border-solid border-current bg-transparent px-0 pb-0.5 pt-0 text-left text-sm font-medium transition hover:opacity-90 ${textColorClass}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Изменить статус"
        >
            <span className="min-w-0 break-words">{currentLabel}</span>
            <ChevronDown
                aria-hidden
                strokeWidth={2.25}
                className={`h-3.5 w-3.5 shrink-0 opacity-55 transition-transform duration-200 ease-out will-change-transform ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    return (
        <div className={rootClassName} ref={rootRef}>
            {triggerVariant === "text" ? textTrigger : defaultTrigger}

            {isOpen ? (
                <div
                    className={`absolute left-0 top-[calc(100%+0.35rem)] z-40 rounded-lg border border-admin-border bg-admin-surface p-1 shadow-lg ${menuWidthClassName}`}
                    role="listbox"
                    aria-label="Выбор статуса"
                >
                    {options.map((item) => {
                        const isActive = item.value === value;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                    setIsOpen(false);
                                    onChangeAction(item.value);
                                }}
                                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${isActive ? "bg-admin-primary/10 text-admin-primary" : "text-admin-text hover:bg-admin-muted"}`}
                            >
                                <span>{item.label}</span>
                                {isActive ? <Check className="h-4 w-4 text-admin-primary" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
