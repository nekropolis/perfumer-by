"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * URL-backed состояние номера страницы для таблиц в админке.
 *
 * Зачем: единый контракт для всех списков — `?page=N` в URL,
 * выживает F5/«назад», делится ссылкой. Номер страницы 1 в URL
 * не пишем (URL чистый по умолчанию). `AdminSearchInput` уже ведёт
 * `?search=…` сам, этот хук отвечает только за `?page=…`.
 *
 * Использование:
 *   const [page, setPage] = useUrlPage();
 *   // setPage работает как обычный dispatcher useState
 */
export default function useUrlPage(paramKey: string = "page"): [
    number,
    (next: number | ((prev: number) => number)) => void,
] {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [page, setPageState] = useState<number>(() => {
        const raw = Number(searchParams.get(paramKey));
        return Number.isFinite(raw) && raw > 1 ? Math.floor(raw) : 1;
    });

    // Синхронизируем page в URL. Если page === 1 — убираем параметр
    // из URL, чтобы ссылки оставались короткими.
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (page > 1) {
            params.set(paramKey, String(page));
        } else {
            params.delete(paramKey);
        }
        const qs = params.toString();
        if (qs !== searchParams.toString()) {
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
    }, [page, pathname, router, searchParams, paramKey]);

    // Обёртка, чтобы API совпадал с useState<number>.
    const setPage = useCallback(
        (next: number | ((prev: number) => number)) => {
            setPageState((prev) => {
                const resolved = typeof next === "function" ? (next as (p: number) => number)(prev) : next;
                return Math.max(1, Math.floor(resolved) || 1);
            });
        },
        [],
    );

    return [page, setPage];
}

/**
 * Сбрасывает `page → 1` при смене одного из `values` (фильтры/поиск).
 * На первом рендере НЕ срабатывает — иначе `?page=N` из URL затирался бы
 * на mount ещё до того, как пользователь что-то поменял.
 *
 * Важно: все элементы `values` должны быть JSON-сериализуемыми
 * (string/number/bool/null) — для наших фильтров этого достаточно.
 */
export function useResetPageOnChange(
    setPage: (next: number | ((prev: number) => number)) => void,
    values: readonly unknown[],
): void {
    const key = JSON.stringify(values);
    const prevKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (prevKeyRef.current === null) {
            prevKeyRef.current = key;
            return;
        }
        if (prevKeyRef.current !== key) {
            prevKeyRef.current = key;
            setPage(1);
        }
    }, [key, setPage]);
}

