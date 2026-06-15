"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { siteBtnDanger, siteBtnSecondary } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    onConfirmAction: () => void;
    onCloseAction: () => void;
};

export default function SiteConfirmDialog({
    open,
    title = "Подтверждение",
    message,
    confirmText = "Удалить",
    cancelText = "Отмена",
    loading = false,
    onConfirmAction,
    onCloseAction,
}: Props) {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCloseAction();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCloseAction]);

    if (!open || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface p-5 shadow-2xl sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="mb-2 text-lg font-semibold text-admin-text">{title}</div>
                <p className="text-sm leading-relaxed text-admin-text-secondary">{message}</p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCloseAction}
                        disabled={loading}
                        className={`${siteBtnSecondary} w-full sm:w-auto disabled:opacity-50`}
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmAction}
                        disabled={loading}
                        className={`${siteBtnDanger} w-full sm:w-auto disabled:opacity-50`}
                    >
                        {loading ? "Удаление..." : confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
