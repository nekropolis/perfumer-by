"use client";

import { useEffect, useState, type FormEvent } from "react";
import { attachMyLoyaltyCardByNumber } from "@/lib/loyalty-me-api";
import { ApiRequestError } from "@/lib/auth-api";

type Props = {
    onCloseAction: () => void;
    onSuccessAction: () => void;
};

export default function AttachLoyaltyCardModal({ onCloseAction, onSuccessAction }: Props) {
    const [number, setNumber] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCloseAction();
            }
        };

        document.addEventListener("keydown", handleEsc);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleEsc);
            document.body.style.overflow = "";
        };
    }, [onCloseAction]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = number.trim();
        if (!trimmed) {
            setError("Введите номер карты");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const res = await attachMyLoyaltyCardByNumber(trimmed);
            onSuccessAction();
            onCloseAction();
            if (res.link_status === "pending_conflict" && res.message && typeof window !== "undefined") {
                window.alert(res.message);
            }
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Не удалось привязать карту");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="attach-loyalty-title"
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <h2 id="attach-loyalty-title" className="text-lg font-semibold text-gray-900">
                        Добавить накопительную карту
                    </h2>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-lg leading-none text-gray-600 hover:bg-gray-50"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                <p className="mb-4 text-sm text-gray-600">
                    Введите номер карты, выданной в магазине. Карта должна быть активна и не привязана к чужому аккаунту.
                </p>

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                    <div>
                        <label htmlFor="loyalty-card-number" className="mb-1 block text-sm font-medium text-gray-700">
                            Номер карты
                        </label>
                        <input
                            id="loyalty-card-number"
                            type="text"
                            autoComplete="off"
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                            placeholder="Например, 1234567890"
                            disabled={submitting}
                        />
                    </div>

                    {error ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                            disabled={submitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-black px-4 py-2.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
                            disabled={submitting}
                        >
                            {submitting ? "Проверка…" : "Привязать"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
