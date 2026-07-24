"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { VETER_STREET_PREFIXES } from "@/constants/veter-street-prefixes";

type StreetPrefixSelectProps = {
    value: string;
    onChange: (value: string) => void;
    /** storefront rounded-2xl / admin rounded-lg */
    variant?: "site" | "admin";
    className?: string;
    "aria-label"?: string;
};

export default function StreetPrefixSelect({
    value,
    onChange,
    variant = "site",
    className = "",
    "aria-label": ariaLabel = "Тип улицы",
}: StreetPrefixSelectProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listId = useId();

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

    const triggerClass =
        variant === "site"
            ? "flex min-h-10 w-full items-center justify-between gap-1 rounded-2xl border border-admin-border bg-admin-surface px-2 py-2 text-left text-sm text-admin-text outline-none transition hover:border-admin-border-strong focus-visible:border-admin-primary focus-visible:ring-2 focus-visible:ring-admin-primary/15"
            : "flex w-full items-center justify-between gap-1 rounded-lg border border-admin-border bg-admin-surface px-1.5 py-2 text-left text-sm text-admin-text outline-none transition hover:bg-admin-muted focus-visible:border-admin-primary focus-visible:ring-2 focus-visible:ring-admin-primary/15";

    const menuRadius = variant === "site" ? "rounded-2xl" : "rounded-lg";
    const optionRadius = variant === "site" ? "rounded-xl" : "rounded-md";

    return (
        <div className={`relative ${className}`.trim()} ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={triggerClass}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={ariaLabel}
            >
                <span className="whitespace-nowrap leading-none">{value || "—"}</span>
                <ChevronDown
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 text-admin-text-muted transition ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open ? (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={ariaLabel}
                    className={`absolute left-0 z-40 mt-1 max-h-56 min-w-[7.5rem] overflow-auto border border-admin-border bg-admin-surface p-1 shadow-lg ${menuRadius}`}
                >
                    {VETER_STREET_PREFIXES.map((prefix) => {
                        const selected = prefix === value;
                        return (
                            <li key={prefix} role="option" aria-selected={selected}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChange(prefix);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm transition ${optionRadius} ${
                                        selected
                                            ? "bg-admin-primary/10 text-admin-text"
                                            : "text-admin-text hover:bg-admin-muted"
                                    }`}
                                >
                                    <span className="whitespace-nowrap">{prefix}</span>
                                    {selected ? (
                                        <Check className="h-3.5 w-3.5 shrink-0 text-admin-primary" aria-hidden />
                                    ) : (
                                        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
