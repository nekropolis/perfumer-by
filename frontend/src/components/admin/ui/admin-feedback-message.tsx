"use client";

import { useEffect } from "react";

type Props = {
    type: "success" | "error";
    message: string;
    onCloseAction: () => void;
    duration?: number;
};

export default function AdminFeedbackMessage({
                                                 type,
                                                 message,
                                                 onCloseAction,
                                                 duration = 5000,
                                             }: Props) {
    useEffect(() => {
        const timeout = setTimeout(onCloseAction, duration);
        return () => clearTimeout(timeout);
    }, [duration, onCloseAction]);

    const styles =
        type === "success"
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700";

    return (
        <div className="fixed right-4 top-20 z-[100]">
            <div
                className={`min-w-[280px] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${styles}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>{message}</div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="text-xs opacity-60 transition hover:opacity-100"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
}