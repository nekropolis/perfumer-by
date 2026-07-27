"use client";

import { Search, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { adminBtnSecondary, adminInput, adminSelect } from "@/lib/admin-ui-classes";

type Option = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    options: Option[];
    label?: string;
    placeholder?: string;
    emptyLabel?: string;
    title?: string;
    subtitle?: string;
    searchPlaceholder?: string;
    className?: string;
};

export default function AdminSearchableSelect({
    value,
    onChangeAction,
    options,
    label = "",
    placeholder = "Выберите",
    emptyLabel = "Все",
    title = "Выбор",
    subtitle = "Найдите и выберите значение",
    searchPlaceholder = "Поиск…",
    className = "",
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const selected = useMemo(
        () => options.find((option) => option.value === value) || null,
        [options, value],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return options;
        }
        return options.filter((option) => option.label.toLowerCase().includes(q));
    }, [options, query]);

    const close = () => {
        setOpen(false);
        setQuery("");
    };

    return (
        <div className={className}>
            {label ? (
                <label className="mb-1.5 block text-sm font-medium text-admin-text-secondary">{label}</label>
            ) : null}

            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`flex w-full items-center justify-between gap-2 md:w-56 ${adminSelect}`}
            >
                <span className={`truncate ${selected || value === "" ? "text-admin-text" : "text-admin-text-muted"}`}>
                    {selected ? selected.label : value === "" ? emptyLabel || placeholder : placeholder}
                </span>
                <ChevronsUpDown size={16} className="shrink-0 text-admin-text-muted" />
            </button>

            {open ? (
                <div className="fixed inset-0 z-[200] bg-slate-900/50 px-3 py-4 sm:px-4 sm:py-6">
                    <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:h-auto sm:max-h-[min(88dvh,640px)] sm:rounded-xl">
                        <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-3 sm:px-5 sm:py-4">
                            <div className="min-w-0">
                                <div className="text-base font-semibold text-admin-text">{title}</div>
                                <div className="text-sm text-admin-text-secondary">{subtitle}</div>
                            </div>
                            <button type="button" onClick={close} className={`${adminBtnSecondary} shrink-0`}>
                                Закрыть
                            </button>
                        </div>

                        <div className="border-b border-admin-border p-4">
                            <div className="relative">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-muted"
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    autoFocus
                                    className={`${adminInput} pl-9`}
                                />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            <div className="space-y-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChangeAction("");
                                        close();
                                    }}
                                    className={`block min-h-10 w-full rounded-lg px-4 py-2.5 text-left text-sm transition ${
                                        value === ""
                                            ? "bg-admin-primary text-white"
                                            : "text-admin-text hover:bg-admin-muted"
                                    }`}
                                >
                                    {emptyLabel}
                                </button>

                                {filtered.length > 0 ? (
                                    filtered.map((option) => {
                                        const isActive = option.value === value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => {
                                                    onChangeAction(option.value);
                                                    close();
                                                }}
                                                className={`block min-h-10 w-full rounded-lg px-4 py-2.5 text-left text-sm transition ${
                                                    isActive
                                                        ? "bg-admin-primary text-white"
                                                        : "text-admin-text hover:bg-admin-muted"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-lg border border-dashed border-admin-border px-4 py-6 text-center text-sm text-admin-text-secondary">
                                        Ничего не найдено
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
