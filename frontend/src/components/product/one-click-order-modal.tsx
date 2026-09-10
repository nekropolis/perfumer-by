"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MousePointerClick, X } from "lucide-react";
import PhoneInput, {
    isBelarusPhoneComplete,
    isPlainByPhoneComplete,
    normalizePlainByDigitsInput,
} from "@/components/ui/phone-input";
import { useAuth } from "@/components/auth/auth-provider";
import { authUserCheckoutName } from "@/lib/auth-api";
import { createOneClickOrder } from "@/lib/one-click-order-api";
import { LEGAL_PAGE_PATHS } from "@/lib/legal-links";
import LegalHelpIcon from "@/components/legal/legal-help-icon";
import { siteBtnPrimary, siteBtnSecondary } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    onCloseAction: () => void;
    productId: number;
    productName: string;
    variantId: number | null;
    variantTitle?: string | null;
};

export default function OneClickOrderModal({
    open,
    onCloseAction,
    productId,
    productName,
    variantId,
    variantTitle,
}: Props) {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [allowPlainPhone, setAllowPlainPhone] = useState(false);
    const [consentTerms, setConsentTerms] = useState(false);
    const [consentAttempted, setConsentAttempted] = useState(false);
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
        setCustomerName(authUserCheckoutName(user) || "");
        setPhone(user?.phone?.trim() || "");
        setAllowPlainPhone(false);
        setConsentTerms(false);
        setConsentAttempted(false);
        setIsSubmitting(false);

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
    }, [open, onCloseAction, user]);

    if (!open || !mounted) {
        return null;
    }

    const phoneIsValid = allowPlainPhone ? isPlainByPhoneComplete(phone) : isBelarusPhoneComplete(phone);
    const nameIsValid = customerName.trim().length > 0;
    const canSubmit = nameIsValid && phoneIsValid && consentTerms && variantId !== null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setErrorMessage("");
        setSuccessMessage("");

        if (!nameIsValid) {
            setErrorMessage("Укажите имя");
            return;
        }

        if (!phoneIsValid) {
            setErrorMessage(
                allowPlainPhone
                    ? "Укажите номер с кодом страны: 8–15 цифр."
                    : "Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX",
            );
            return;
        }

        if (variantId === null) {
            setErrorMessage("Выберите вариант товара");
            return;
        }

        setConsentAttempted(true);
        if (!consentTerms) {
            setErrorMessage("Примите условия публичной оферты и обработки персональных данных");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await createOneClickOrder({
                product_id: productId,
                variant_id: variantId,
                customer_name: customerName.trim(),
                phone,
                phone_plain_digits: allowPlainPhone,
                consent_offer: true,
                consent_privacy: true,
            });

            setSuccessMessage(
                response.message ||
                    "Заказ принят — менеджер свяжется с вами для уточнения деталей.",
            );
        } catch (error) {
            console.error(error);

            const err = error as Error & {
                status?: number;
                errors?: Record<string, string[]>;
            };

            if (err?.status === 429) {
                setErrorMessage("Слишком много запросов. Попробуйте ещё раз через минуту.");
            } else if (err?.errors && typeof err.errors === "object") {
                const firstKey = Object.keys(err.errors)[0];
                const firstMessage = firstKey ? err.errors[firstKey]?.[0] : null;
                setErrorMessage(firstMessage || "Не удалось оформить заказ.");
            } else {
                setErrorMessage(err?.message || "Не удалось оформить заказ.");
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

    const contextLine = `${productName}${variantTitle ? ` · ${variantTitle}` : ""}`;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onMouseDown={handleOverlayClick}
        >
            <div
                className="relative w-full max-w-sm overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-3xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="one-click-order-title"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id="one-click-order-title"
                            className="flex items-center gap-2 text-lg font-semibold leading-tight"
                        >
                            <MousePointerClick className="h-5 w-5 text-[var(--accent)]" />
                            Купить в один клик
                        </h2>
                        <div className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                            {contextLine}
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
                        <div className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4 text-sm leading-6 text-[var(--foreground)]">
                            {successMessage}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]"
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
                            <label
                                htmlFor="one-click-customer-name"
                                className="mb-1 block text-sm font-medium text-[var(--foreground)]"
                            >
                                Имя
                            </label>
                            <input
                                id="one-click-customer-name"
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                autoComplete="name"
                                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                                placeholder="Как к вам обращаться"
                            />
                        </div>

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
                                        className={`rounded-2xl border px-2.5 py-1 text-[11px] font-medium transition ${
                                            allowPlainPhone
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

                        <label
                            htmlFor="one-click-consent-terms"
                            className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-admin-text"
                        >
                            <input
                                id="one-click-consent-terms"
                                type="checkbox"
                                checked={consentTerms}
                                onChange={(e) => setConsentTerms(e.target.checked)}
                                className={`mt-0.5 h-4 w-4 shrink-0 rounded border-admin-border accent-admin-primary ${
                                    consentAttempted && !consentTerms
                                        ? "outline outline-2 outline-offset-1 outline-red-500"
                                        : ""
                                }`}
                            />
                            <span>
                                Нажимая «Купить в один клик», я принимаю условия{" "}
                                <Link
                                    href={LEGAL_PAGE_PATHS.offer}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-admin-primary underline-offset-2 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    публичной оферты
                                </Link>
                                <LegalHelpIcon
                                    href={LEGAL_PAGE_PATHS.offer}
                                    label="Открыть публичную оферту"
                                />{" "}
                                и согласен(а) на обработку персональных данных согласно{" "}
                                <Link
                                    href={LEGAL_PAGE_PATHS.privacy}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-admin-primary underline-offset-2 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    политике
                                </Link>
                                <LegalHelpIcon
                                    href={LEGAL_PAGE_PATHS.privacy}
                                    label="Открыть политику обработки персональных данных"
                                />
                                .
                                {consentAttempted && !consentTerms ? (
                                    <span className="mt-1 block text-xs text-red-600">
                                        Отметьте согласие, чтобы оформить заказ.
                                    </span>
                                ) : null}
                            </span>
                        </label>

                        {errorMessage && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {errorMessage}
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
                            <button
                                type="button"
                                onClick={onCloseAction}
                                className={`${siteBtnSecondary} w-full sm:w-auto`}
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !canSubmit}
                                className={`${siteBtnPrimary} w-full sm:w-auto`}
                            >
                                {isSubmitting ? "Отправка..." : "Купить в один клик"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}
