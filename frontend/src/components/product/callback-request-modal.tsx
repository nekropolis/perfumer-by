"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PhoneCall, X } from "lucide-react";
import PhoneInput, {
    isBelarusPhoneComplete,
    isPlainByPhoneComplete,
    normalizePlainByDigitsInput,
} from "@/components/ui/phone-input";
import { createCallbackRequest } from "@/lib/stock-notifications-api";

type Props = {
    open: boolean;
    onCloseAction: () => void;
    productId?: number | null;
    productName?: string | null;
    variantId?: number | null;
    variantTitle?: string | null;
};

export default function CallbackRequestModal({
    open,
    onCloseAction,
    productId,
    productName,
    variantId,
    variantTitle,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [phone, setPhone] = useState("");
    const [allowPlainPhone, setAllowPlainPhone] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;

        setErrorMessage("");
        setSuccessMessage("");

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCloseAction();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onCloseAction]);

    useEffect(() => {
        if (!open) {
            setPhone("");
            setAllowPlainPhone(false);
            setErrorMessage("");
            setSuccessMessage("");
            setIsSubmitting(false);
        }
    }, [open]);

    if (!open || !mounted) {
        return null;
    }

    const phoneIsValid = allowPlainPhone ? isPlainByPhoneComplete(phone) : isBelarusPhoneComplete(phone);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setErrorMessage("");
        setSuccessMessage("");

        if (!phoneIsValid) {
            setErrorMessage(
                allowPlainPhone
                    ? "Укажите номер с кодом страны: 8–15 цифр."
                    : "Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX",
            );
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await createCallbackRequest({
                product_id: productId ?? null,
                variant_id: variantId ?? null,
                phone,
                phone_plain_digits: allowPlainPhone,
            });

            setSuccessMessage(
                response.message ||
                "Спасибо! Запрос отправлен — ожидайте, мы перезвоним в ближайшее время.",
            );
        } catch (error) {
            console.error(error);

            const err = error as Error & {
                status?: number;
                errors?: Record<string, string[]>;
            };

            if (err?.status === 429) {
                setErrorMessage(
                    "Слишком много запросов. Попробуйте ещё раз через минуту.",
                );
            } else if (err?.errors && typeof err.errors === "object") {
                const firstKey = Object.keys(err.errors)[0];
                const firstMessage = firstKey ? err.errors[firstKey]?.[0] : null;
                setErrorMessage(firstMessage || "Не удалось отправить запрос.");
            } else {
                setErrorMessage(err?.message || "Не удалось отправить запрос.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOverlayClick = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            onCloseAction();
        }
    };

    const contextLine = productName
        ? `${productName}${variantTitle ? ` · ${variantTitle}` : ""}`
        : null;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onMouseDown={handleOverlayClick}
        >
            <div
                className="relative w-full max-w-sm overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-3xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="callback-request-title"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id="callback-request-title"
                            className="flex items-center gap-2 text-lg font-semibold leading-tight"
                        >
                            <PhoneCall className="h-5 w-5 text-[var(--accent)]" />
                            Заказать звонок
                        </h2>
                        {contextLine ? (
                            <div className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                                {contextLine}
                            </div>
                        ) : (
                            <div className="mt-0.5 text-sm text-[var(--text-secondary)]">
                                Оставьте номер — мы перезвоним
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="shrink-0 rounded-full p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                        aria-label="Закрыть"
                    >
                        <X size={18} />
                    </button>
                </div>

                {successMessage ? (
                    <div className="px-5 py-6">
                        <div className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4 text-sm leading-6 text-[var(--foreground)]">
                            {successMessage}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5" noValidate>
                        <input
                            type="text"
                            name="website"
                            tabIndex={-1}
                            autoComplete="off"
                            className="hidden"
                            aria-hidden="true"
                        />

                        <div>
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <label className="text-sm font-medium text-[var(--foreground)]">
                                    Телефон
                                </label>
                                <label className="inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={allowPlainPhone}
                                        onChange={(e) => {
                                            setAllowPlainPhone(e.target.checked);
                                            setPhone((prev) =>
                                                e.target.checked ? normalizePlainByDigitsInput(prev) : prev,
                                            );
                                        }}
                                        className="peer sr-only"
                                    />
                                    <span
                                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${allowPlainPhone
                                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]"
                                                : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                                            }`}
                                    >
                                        Международный номер
                                    </span>
                                </label>
                            </div>
                            <PhoneInput value={phone} onChangeAction={setPhone} plainDigitsMode={allowPlainPhone} />
                        </div>

                        {errorMessage && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {errorMessage}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm transition hover:bg-[var(--background)]"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !phoneIsValid}
                                className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? "Отправка..." : "Заказать звонок"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}
