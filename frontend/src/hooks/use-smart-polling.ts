"use client";

import { useCallback, useEffect, useRef } from "react";

type FetcherResult = boolean | { active: boolean };

export type SmartPollingOptions = {
    /**
     * Интервал между опросами, когда на прошлом тике `fetcher` вернул «есть активная работа».
     * Например, 5000 мс — живой прогресс текущего джоба.
     */
    activeIntervalMs: number;

    /**
     * Интервал в «холостом» режиме (нет активной работы). Делается
     * сознательно больше, чтобы не шумело в сети. Рекомендуется 3-6x
     * от `activeIntervalMs` (например, 20000-30000 мс).
     */
    idleIntervalMs: number;

    /**
     * Функция опроса. Должна вернуть `true` / `{ active: true }`, если на
     * следующем тике нужен «боевой» интервал, иначе — `false`.
     * AbortSignal передаётся в fetch: при размонтировании/скрытии
     * вкладки запрос отменяется.
     */
    fetcherAction: (signal: AbortSignal) => Promise<FetcherResult>;

    /**
     * Пауза на скрытой вкладке (`document.hidden`). По умолчанию true.
     * При возврате к вкладке делаем немедленный rerun.
     */
    pauseWhenHidden?: boolean;

    /**
     * Переопрос при `window focus`. По умолчанию true.
     */
    refetchOnFocus?: boolean;

    /**
     * Полностью отключить поллинг (например, для фича-флага). По умолчанию true.
     */
    enabled?: boolean;
};

/**
 * Поллинг-хук с адаптивным интервалом и паузой на скрытой вкладке.
 *
 * Работает по схеме setTimeout-chain (не setInterval), поэтому запросы не
 * штабелируются, если предыдущий ещё не ответил, и после возврата вкладки не
 * высыпаются «пачкой» пропущенные тики.
 *
 * Пример:
 *   useSmartPolling({
 *     activeIntervalMs: 5_000,
 *     idleIntervalMs: 20_000,
 *     fetcher: async (signal) => {
 *       const { data } = await fetchStatus(signal);
 *       return { active: data?.status === "running" };
 *     },
 *   });
 */
export function useSmartPolling({
    activeIntervalMs,
    idleIntervalMs,
    fetcherAction,
    pauseWhenHidden = true,
    refetchOnFocus = true,
    enabled = true,
}: SmartPollingOptions) {
    const fetcherRef = useRef(fetcherAction);
    fetcherRef.current = fetcherAction;

    const isActiveRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(false);
    const tickRef = useRef<() => void>(() => {});

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const tick = useCallback(async () => {
        if (!mountedRef.current) return;
        if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const result = await fetcherRef.current(controller.signal);
            isActiveRef.current =
                typeof result === "boolean" ? result : Boolean(result?.active);
        } catch {
            // Сетевые/парсинг-ошибки глушим, чтобы поллер не падал. isActive
            // остаётся прежним — просто шагаем на следующий тик.
        } finally {
            if (!mountedRef.current) return;
            clearTimer();
            const delay = isActiveRef.current ? activeIntervalMs : idleIntervalMs;
            timerRef.current = window.setTimeout(() => {
                void tickRef.current();
            }, delay);
        }
    }, [activeIntervalMs, idleIntervalMs, pauseWhenHidden, clearTimer]);

    tickRef.current = tick;

    const refresh = useCallback(() => {
        clearTimer();
        void tick();
    }, [clearTimer, tick]);

    useEffect(() => {
        if (!enabled) return undefined;

        mountedRef.current = true;
        void tick();

        const onVisibilityChange = () => {
            if (document.hidden) {
                clearTimer();
                abortRef.current?.abort();
            } else {
                void tick();
            }
        };

        const onFocus = () => {
            if (document.hidden) return;
            void tick();
        };

        if (pauseWhenHidden) {
            document.addEventListener("visibilitychange", onVisibilityChange);
        }
        if (refetchOnFocus) {
            window.addEventListener("focus", onFocus);
        }

        return () => {
            mountedRef.current = false;
            clearTimer();
            abortRef.current?.abort();
            if (pauseWhenHidden) {
                document.removeEventListener("visibilitychange", onVisibilityChange);
            }
            if (refetchOnFocus) {
                window.removeEventListener("focus", onFocus);
            }
        };
    }, [enabled, pauseWhenHidden, refetchOnFocus, tick, clearTimer]);

    return { refresh };
}

export default useSmartPolling;
