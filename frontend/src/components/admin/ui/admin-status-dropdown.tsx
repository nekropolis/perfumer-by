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
    widthClassName?: string;
    menuWidthClassName?: string;
};

export default function AdminStatusDropdown({
    value,
    options,
    onChangeAction,
    disabled = false,
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

    return (
        <div className={`relative inline-flex ${widthClassName}`} ref={rootRef}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                disabled={disabled}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-left text-sm text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label="Статус"
            >
                <span className="truncate">{currentLabel}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-500 transition ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {isOpen ? (
                <div
                    className={`absolute left-0 top-[calc(100%+0.35rem)] z-40 rounded-xl border border-gray-200 bg-white p-1 shadow-xl ${menuWidthClassName}`}
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
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${isActive ? "bg-gray-100 text-black" : "text-gray-700 hover:bg-gray-50"}`}
                            >
                                <span>{item.label}</span>
                                {isActive ? <Check className="h-4 w-4 text-gray-700" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
