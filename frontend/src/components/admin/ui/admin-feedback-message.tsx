"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type Props = {
    type: "success" | "error";
    message: string;
    onCloseAction: () => void;
    duration?: number;
};

const EXIT_MS = 340;

export default function AdminFeedbackMessage({
    type,
    message,
    onCloseAction,
    duration = 4200,
}: Props) {
    const [portalReady, setPortalReady] = useState(false);
    const [open, setOpen] = useState(false);
    const closingRef = useRef(false);
    const exitTimerRef = useRef<number>(0);
    const onCloseRef = useRef(onCloseAction);
    onCloseRef.current = onCloseAction;

    const beginClose = () => {
        if (closingRef.current) {
            return;
        }
        closingRef.current = true;
        setOpen(false);
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = window.setTimeout(() => {
            onCloseRef.current();
        }, EXIT_MS);
    };

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        closingRef.current = false;
        setOpen(false);

        const enterFrame = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (!closingRef.current) {
                    setOpen(true);
                }
            });
        });

        const autoTimer = window.setTimeout(beginClose, duration);

        return () => {
            window.cancelAnimationFrame(enterFrame);
            window.clearTimeout(autoTimer);
            window.clearTimeout(exitTimerRef.current);
        };
        // Intentionally re-run only when toast content/timing changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message, type, duration]);

    if (!portalReady || typeof document === "undefined") {
        return null;
    }

    const isSuccess = type === "success";

    return createPortal(
        <div
            className="pointer-events-none fixed right-0 top-0 z-[400] flex justify-end px-3 pt-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] sm:px-4 sm:pt-[4.5rem]"
            role="status"
            aria-live="polite"
        >
            <div
                className={[
                    "pointer-events-auto flex w-[min(22.5rem,calc(100vw-1.5rem))] items-start gap-2.5 rounded-[14px]",
                    "bg-white/82 px-3.5 py-3 text-[13px] leading-snug text-[#1c1c1e] shadow-[0_12px_40px_rgba(0,0,0,0.16),0_1px_0_rgba(255,255,255,0.7)_inset]",
                    "ring-1 ring-black/8 backdrop-blur-2xl backdrop-saturate-150",
                    "transition-[opacity,transform] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                    open
                        ? "translate-x-0 opacity-100"
                        : "translate-x-[110%] opacity-0",
                ].join(" ")}
            >
                <div
                    className={[
                        "mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        isSuccess ? "bg-[#34c759]/18 text-[#1f8f3a]" : "bg-[#ff3b30]/16 text-[#d70015]",
                    ].join(" ")}
                    aria-hidden
                >
                    {isSuccess ? (
                        <CheckCircle2 size={16} strokeWidth={2.25} />
                    ) : (
                        <AlertCircle size={16} strokeWidth={2.25} />
                    )}
                </div>

                <div className="min-w-0 flex-1 pt-1 font-medium tracking-[-0.01em]">{message}</div>

                <button
                    type="button"
                    onClick={beginClose}
                    className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[#8e8e93] transition hover:bg-black/[0.1] hover:text-[#1c1c1e]"
                    aria-label="Закрыть"
                >
                    <X size={14} strokeWidth={2.25} />
                </button>
            </div>
        </div>,
        document.body,
    );
}
