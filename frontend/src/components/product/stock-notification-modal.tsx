"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import PhoneInput, {
    isBelarusPhoneComplete,
    isPlainByPhoneComplete,
    normalizePlainByDigitsInput,
} from "@/components/ui/phone-input";
import { createStockNotificationRequest } from "@/lib/stock-notifications-api";

type Props = {
    open: boolean;
    onCloseAction: () => void;
    productId: number;
    productName: string;
    variantId?: number | null;
    variantTitle?: string | null;
};

const COMMENT_MAX_LENGTH = 500;

// Базовая клиентская защита: отсеиваем HTML-теги и ссылки на скрипты / js:
// это не заменяет бэкенд-валидацию, но снижает шум из автоматических ботов.
function sanitizeCommentClient(value: string): string {
    return value
        .replace(/<[^>]*>/g, "")
        .replace(/\r\n?/g, "\n");
}

function containsSuspiciousPayload(value: string): boolean {
    const lower = value.toLowerCase();
    return (
        lower.includes("<script") ||
        lower.includes("javascript:") ||
        lower.includes("onerror=") ||
        lower.includes("onload=") ||
        /https?:\/\/[^\s]+\s*https?:\/\//i.test(lower)
    );
}

export default function StockNotificationModal({
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
    const [comment, setComment] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement | null>(null);

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
            setComment("");
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

        const cleanedComment = sanitizeCommentClient(comment).trim();

        if (cleanedComment.length > COMMENT_MAX_LENGTH) {
            setErrorMessage(`Комментарий не должен превышать ${COMMENT_MAX_LENGTH} символов.`);
            return;
        }

        if (cleanedComment && containsSuspiciousPayload(cleanedComment)) {
            setErrorMessage("Комментарий содержит недопустимые символы или ссылки.");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await createStockNotificationRequest({
                product_id: productId,
                variant_id: variantId ?? null,
                phone,
                phone_plain_digits: allowPlainPhone,
                comment: cleanedComment || undefined,
            });

            setSuccessMessage(
                response.message ||
                "Спасибо! Мы напишем вам, как только товар появится в наличии.",
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

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onMouseDown={handleOverlayClick}
        >
            <div
                className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-3xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-notification-title"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id="stock-notification-title"
                            className="text-lg font-semibold leading-tight"
                        >
                            Сообщить о появлении
                        </h2>
                        <div className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                            {productName}
                            {variantTitle ? ` · ${variantTitle}` : ""}
                        </div>
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
                        <div className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--foreground)]">
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
                    <form
                        ref={formRef}
                        onSubmit={handleSubmit}
                        className="space-y-4 px-5 py-5"
                        noValidate
                    >
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
                                        Нет мобильного
                                    </span>
                                </label>
                            </div>
                            <PhoneInput value={phone} onChangeAction={setPhone} plainDigitsMode={allowPlainPhone} />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                                Комментарий{" "}
                                <span className="text-[var(--text-secondary)]">(необязательно)</span>
                            </label>
                            <textarea
                                value={comment}
                                onChange={(e) =>
                                    setComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))
                                }
                                maxLength={COMMENT_MAX_LENGTH}
                                rows={3}
                                placeholder="Например: интересует флакон 100 мл"
                                className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                            />
                            <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                                <span>
                                    {comment.length} / {COMMENT_MAX_LENGTH}
                                </span>
                            </div>
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
                                {isSubmitting ? "Отправка..." : "Отправить"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}
