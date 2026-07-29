"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { adminBtnDanger, adminBtnSecondary, adminModalOverlay } from "@/lib/admin-ui-classes";

type Props = {
    open: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmLoadingText?: string;
    loading?: boolean;
    onConfirmAction: () => void;
    onCloseAction: () => void;
};

export default function AdminConfirmDialog({
    open,
    title = "Подтверждение",
    message,
    confirmText = "Удалить",
    cancelText = "Отмена",
    confirmLoadingText,
    loading = false,
    onConfirmAction,
    onCloseAction,
}: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div className={adminModalOverlay} onClick={onCloseAction} role="presentation">
            <div
                className="w-full max-w-md rounded-xl border border-admin-border bg-admin-surface p-5 shadow-2xl sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="mb-2 text-lg font-semibold text-admin-text">{title}</div>

                <div className="text-sm text-admin-text-secondary">{message}</div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCloseAction}
                        disabled={loading}
                        className={`${adminBtnSecondary} w-full sm:w-auto disabled:opacity-50`}
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirmAction}
                        disabled={loading}
                        className={`${adminBtnDanger} w-full sm:w-auto disabled:opacity-50`}
                    >
                        {loading ? (confirmLoadingText ?? "Удаление...") : confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
