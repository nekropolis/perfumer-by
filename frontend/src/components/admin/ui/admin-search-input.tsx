"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { adminInput } from "@/lib/admin-ui-classes";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    widthClassName?: string;
    queryParamKey?: string;
    syncWithUrl?: boolean;
};

export default function AdminSearchInput({
    value,
    onChangeAction,
    placeholder = "Поиск...",
    className = "",
    widthClassName = "w-full max-w-full md:max-w-72",
    queryParamKey = "search",
    syncWithUrl = true,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const updateUrl = useCallback(
        (nextValue: string) => {
            if (!syncWithUrl) {
                return;
            }

            const params = new URLSearchParams(searchParams.toString());

            if (nextValue) {
                params.set(queryParamKey, nextValue);
            } else {
                params.delete(queryParamKey);
            }

            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, queryParamKey, router, searchParams, syncWithUrl],
    );

    return (
        <div className={className}>
            <div className={`relative ${widthClassName}`}>
                <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-muted"
                />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        const nextValue = e.target.value;
                        onChangeAction(nextValue);
                        updateUrl(nextValue);
                    }}
                    placeholder={placeholder}
                    className={`${adminInput} pl-9 pr-10`}
                />
                {value ? (
                    <button
                        type="button"
                        onClick={() => {
                            onChangeAction("");
                            updateUrl("");
                        }}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-admin-text-muted transition hover:bg-admin-muted hover:text-admin-text"
                        aria-label="Очистить поиск"
                        title="Очистить"
                    >
                        <X size={14} />
                    </button>
                ) : null}
            </div>
        </div>
    );
}
