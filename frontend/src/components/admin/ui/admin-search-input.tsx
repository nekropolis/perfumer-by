"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    queryParamKey?: string;
    syncWithUrl?: boolean;
};

/**
 * Поиск для админских таблиц.
 *
 * Контракт по состоянию:
 *   - Источник правды — `value` из родителя (обычно `searchInput` в useState).
 *   - Родитель сам инициализирует стейт из URL один раз, при монтировании:
 *       useState(() => searchParamsFromUrl.get("search") ?? "")
 *   - Этот компонент ТОЛЬКО пишет в URL при изменениях ввода
 *     (state → URL). Обратную синхронизацию URL → state тут НЕ делаем.
 *
 * Почему так: если пытаться здесь подтягивать URL → state, ломается из-за
 * гонки между setState (синхронный) и router.replace (асинхронный). В один
 * рендер `value` уже новый, а `useSearchParams()` ещё старый — и эффект
 * «синхронизации» перезатирает только что введённый символ.
 */
export default function AdminSearchInput({
                                             value,
                                             onChangeAction,
                                             placeholder = "Поиск...",
                                             className = "",
                                             queryParamKey = "search",
                                             syncWithUrl = true,
                                         }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const updateUrl = useCallback((nextValue: string) => {
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
    }, [pathname, queryParamKey, router, searchParams, syncWithUrl]);

    return (
        <div className={className}>
            <div className="relative md:w-72">
                <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-10 text-sm transition outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
                {value ? (
                    <button
                        type="button"
                        onClick={() => {
                            onChangeAction("");
                            updateUrl("");
                        }}
                        className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
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
