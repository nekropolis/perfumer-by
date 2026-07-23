"use client";

import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { attachMyLoyaltyCardByNumber } from "@/lib/loyalty-me-api";
import { ApiRequestError } from "@/lib/auth-api";
import { siteBtnGhost, siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";

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
            className="fixed inset-0 z-50 flex items-end justify-center bg-admin-text/40 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className={`${siteCard} w-full max-w-md overflow-hidden shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="attach-loyalty-title"
            >
                <div className="border-b border-admin-border px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 id="attach-loyalty-title" className="text-lg font-semibold tracking-tight text-admin-text">
                                Добавить карту
                            </h2>
                            <p className="mt-1 text-sm text-admin-text-secondary">
                                Накопительная скидка будет применяться к заказам
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCloseAction}
                            className={`${siteBtnGhost} h-9 w-9 shrink-0 p-0`}
                            aria-label="Закрыть"
                        >
                            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                        </button>
                    </div>

                    <div className="mt-4 rounded-lg border border-dashed border-admin-border bg-admin-muted/60 px-4 py-3">
                        <div className="font-mono text-lg font-semibold tracking-[0.16em] text-admin-text">
                            •••• •••• ••••
                        </div>
                    </div>
                </div>

                <div className="p-5 sm:p-6">
                    <p className="mb-5 text-sm leading-6 text-admin-text-secondary">
                        Введите номер карты, выданной в магазине. Карта должна быть активна.
                    </p>

                    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                        <div>
                            <label
                                htmlFor="loyalty-card-number"
                                className="mb-1.5 block text-sm font-medium text-admin-text"
                            >
                                Номер карты
                            </label>

                            <input
                                id="loyalty-card-number"
                                type="text"
                                autoComplete="off"
                                value={number}
                                onChange={(e) => setNumber(e.target.value)}
                                className={siteInput}
                                placeholder="Например, 1234567890"
                                disabled={submitting}
                            />
                        </div>

                        {error ? (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className={siteBtnSecondary}
                                disabled={submitting}
                            >
                                Отмена
                            </button>

                            <button type="submit" className={siteBtnPrimary} disabled={submitting}>
                                {submitting ? "Проверка…" : "Привязать карту"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
