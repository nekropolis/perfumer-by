"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

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

    const isSuccess = type === "success";
    const styles = isSuccess
        ? "border-green-200 bg-green-50 text-green-800"
        : "border-red-200 bg-red-50 text-red-800";

    return (
        <div className="fixed right-4 top-20 z-[100]">
            <div
                className={`min-w-[300px] max-w-md rounded-2xl border px-4 py-3 text-sm shadow-lg ${styles}`}
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                        {isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    </div>

                    <div className="flex-1 leading-6">{message}</div>

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
