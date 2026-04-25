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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="w-full max-w-md overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_90px_rgba(31,23,34,0.22)]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="attach-loyalty-title"
            >
                <div className="bg-[var(--accent)] px-6 py-5 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/60">
                                Loyalty Card
                            </div>

                            <h2
                                id="attach-loyalty-title"
                                className="mt-2 font-display text-2xl font-semibold leading-tight"
                            >
                                Добавить карту
                            </h2>
                        </div>

                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
                            aria-label="Закрыть"
                        >
                            ×
                        </button>
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                        <div className="font-mono text-lg font-semibold tracking-[0.16em]">
                            •••• •••• ••••
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                            Накопительная скидка будет применяться к заказам.
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <p className="mb-5 text-sm leading-6 text-[var(--text-secondary)]">
                        Введите номер карты, выданной в магазине. Карта должна быть активна.
                    </p>

                    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                        <div>
                            <label
                                htmlFor="loyalty-card-number"
                                className="mb-2 block text-sm font-medium text-[var(--foreground)]"
                            >
                                Номер карты
                            </label>

                            <input
                                id="loyalty-card-number"
                                type="text"
                                autoComplete="off"
                                value={number}
                                onChange={(e) => setNumber(e.target.value)}
                                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[var(--accent-soft)]/45"
                                placeholder="Например, 1234567890"
                                disabled={submitting}
                            />
                        </div>

                        {error ? (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={submitting}
                            >
                                Отмена
                            </button>

                            <button
                                type="submit"
                                className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={submitting}
                            >
                                {submitting ? "Проверка…" : "Привязать карту"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}