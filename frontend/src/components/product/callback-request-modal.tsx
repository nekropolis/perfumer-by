"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PhoneCall, X } from "lucide-react";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";
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
            setErrorMessage("");
            setSuccessMessage("");
            setIsSubmitting(false);
        }
    }, [open]);

    if (!open || !mounted) {
        return null;
    }

    const phoneIsValid = isBelarusPhoneComplete(phone);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setErrorMessage("");
        setSuccessMessage("");

        if (!phoneIsValid) {
            setErrorMessage("Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await createCallbackRequest({
                product_id: productId ?? null,
                variant_id: variantId ?? null,
                phone,
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
                className="relative w-full max-w-sm overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="callback-request-title"
            >
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id="callback-request-title"
                            className="flex items-center gap-2 text-lg font-semibold leading-tight"
                        >
                            <PhoneCall className="h-5 w-5 text-emerald-600" />
                            Заказать звонок
                        </h2>
                        {contextLine ? (
                            <div className="mt-0.5 truncate text-sm text-gray-500">
                                {contextLine}
                            </div>
                        ) : (
                            <div className="mt-0.5 text-sm text-gray-500">
                                Оставьте номер — мы перезвоним
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Закрыть"
                    >
                        <X size={18} />
                    </button>
                </div>

                {successMessage ? (
                    <div className="px-5 py-6">
                        <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                            {successMessage}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
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
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Телефон
                            </label>
                            <PhoneInput value={phone} onChangeAction={setPhone} />
                            <p className="mt-1 text-xs text-gray-400">
                                Формат: +375 (25/29/33/44) XXX-XX-XX
                            </p>
                        </div>

                        {errorMessage && (
                            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                                {errorMessage}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-xl border px-4 py-2 text-sm transition hover:bg-gray-50"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !phoneIsValid}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
