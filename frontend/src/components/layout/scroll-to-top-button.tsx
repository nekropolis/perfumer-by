"use client";

import { ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const SHOW_AFTER_PX = 480;

/**
 * Фиксированная кнопка «вверх» для длинных страниц витрины.
 * Подключена в `AppShell` (не админка); при необходимости можно дублировать на отдельных layout.
 */
export default function ScrollToTopButton() {
    const [visible, setVisible] = useState(false);

    const onScroll = useCallback(() => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        setVisible(y > SHOW_AFTER_PX);
    }, []);

    useEffect(() => {
        const frameId = requestAnimationFrame(() => {
            onScroll();
        });
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener("scroll", onScroll);
        };
    }, [onScroll]);

    if (!visible) {
        return null;
    }

    return (
        <button
            type="button"
            aria-label="Прокрутить страницу в начало"
            title="Прокрутить страницу в начало"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-4 z-[60] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--accent)]/25 bg-[var(--surface)] text-[var(--accent)] shadow-md transition hover:bg-[var(--accent-soft)] md:right-6"
        >
            <ChevronUp className="h-5 w-5" aria-hidden />
        </button>
    );
}
