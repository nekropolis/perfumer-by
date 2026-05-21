"use client";

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
    if (!open) {
        return null;
    }

    return (
        <div className={adminModalOverlay} onClick={onCloseAction} role="presentation">
            <div
                className="w-full max-w-md rounded-xl border border-admin-border bg-admin-surface p-5 shadow-2xl sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="mb-2 text-lg font-semibold text-admin-text">{title}</div>

                <div className="text-sm text-admin-text-secondary">{message}</div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCloseAction}
                        disabled={loading}
                        className={`${adminBtnSecondary} disabled:opacity-50`}
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirmAction}
                        disabled={loading}
                        className={`${adminBtnDanger} disabled:opacity-50`}
                    >
                        {loading ? (confirmLoadingText ?? "Удаление...") : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
