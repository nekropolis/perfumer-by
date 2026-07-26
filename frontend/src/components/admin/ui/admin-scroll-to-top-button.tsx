"use client";

import { ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState, type RefObject } from "react";

const SHOW_AFTER_PX = 400;

type Props = {
    scrollRef: RefObject<HTMLElement | null>;
};

/** Кнопка «наверх» для основного скролл-контейнера админки. */
export default function AdminScrollToTopButton({ scrollRef }: Props) {
    const [visible, setVisible] = useState(false);

    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        setVisible(Boolean(el && el.scrollTop > SHOW_AFTER_PX));
    }, [scrollRef]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }

        const frameId = requestAnimationFrame(() => {
            onScroll();
        });
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frameId);
            el.removeEventListener("scroll", onScroll);
        };
    }, [onScroll, scrollRef]);

    if (!visible) {
        return null;
    }

    return (
        <button
            type="button"
            aria-label="Прокрутить в начало"
            title="Прокрутить в начало"
            onClick={() => {
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="fixed bottom-5 right-5 z-[80] inline-flex h-10 w-10 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin-text shadow-md transition hover:bg-admin-muted"
        >
            <ChevronUp size={18} aria-hidden />
        </button>
    );
}
