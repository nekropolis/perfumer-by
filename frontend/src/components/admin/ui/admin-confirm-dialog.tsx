"use client";

type Props = {
    open: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

export default function AdminConfirmDialog({
                                               open,
                                               title = "Подтверждение",
                                               message,
                                               confirmText = "Удалить",
                                               cancelText = "Отмена",
                                               loading = false,
                                               onConfirm,
                                               onClose,
                                           }: Props) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-2 text-lg font-semibold">{title}</div>

                <div className="text-sm text-gray-600">{message}</div>

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {loading ? "Удаление..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
