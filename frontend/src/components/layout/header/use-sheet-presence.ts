"use client";

import { useEffect, useRef, useState, type TransitionEvent } from "react";

const SHEET_MS = 600;

/** Держит панель смонтированной, пока translateY доезжает, как у фильтров каталога. */
export function useSheetPresence(open: boolean) {
    const [mounted, setMounted] = useState(false);
    const [sheetState, setSheetState] = useState<"open" | "closed">("closed");
    const closeAfterTransitionRef = useRef(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        closeAfterTransitionRef.current = false;
        setMounted(true);
        setSheetState("closed");
    }, [open]);

    useEffect(() => {
        if (!mounted || sheetState !== "closed" || closeAfterTransitionRef.current) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            document.querySelector(".storefront-sheet")?.getBoundingClientRect();
            requestAnimationFrame(() => {
                if (!closeAfterTransitionRef.current) {
                    setSheetState("open");
                }
            });
        });

        return () => cancelAnimationFrame(frame);
    }, [mounted, sheetState]);

    useEffect(() => {
        if (open || !mounted) {
            return;
        }

        closeAfterTransitionRef.current = true;
        setSheetState("closed");

        const timeout = window.setTimeout(() => {
            if (!closeAfterTransitionRef.current) {
                return;
            }
            setMounted(false);
            closeAfterTransitionRef.current = false;
        }, SHEET_MS + 80);

        return () => window.clearTimeout(timeout);
    }, [open, mounted]);

    const onTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || event.propertyName !== "transform") {
            return;
        }
        if (!closeAfterTransitionRef.current || sheetState !== "closed") {
            return;
        }
        setMounted(false);
        closeAfterTransitionRef.current = false;
    };

    return { mounted, sheetState, onTransitionEnd };
}
