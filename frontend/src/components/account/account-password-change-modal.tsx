"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ApiRequestError, requestPasswordChange, verifyPasswordChange } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";
import SmsDevHint from "@/components/ui/sms-dev-hint";
import PasswordInput from "@/components/ui/password-input";

const inputClassName =
    "w-full rounded-2xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[var(--accent-soft)]/45";

type AccountPasswordChangeModalProps = {
    phone: string;
    onCloseAction: () => void;
    onSuccessAction: () => void;
};

export default function AccountPasswordChangeModal({
    phone,
    onCloseAction,
    onSuccessAction,
}: AccountPasswordChangeModalProps) {
    const [step, setStep] = useState<"form" | "code">("form");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState("");
    const [infoMessage, setInfoMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isPending) {
                onCloseAction();
            }
        };

        document.addEventListener("keydown", handleEsc);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleEsc);
            document.body.style.overflow = "";
        };
    }, [onCloseAction, isPending]);

    const handleRequestCode = () => {
        const token = getAuthToken();
        if (!token) {
            return;
        }

        if (password.length < 8) {
            setErrorMessage("Пароль должен быть не короче 8 символов");
            return;
        }

        if (password !== passwordConfirmation) {
            setErrorMessage("Пароли не совпадают");
            return;
        }

        setErrorMessage("");
        setInfoMessage("");

        startTransition(async () => {
            try {
                const response = await requestPasswordChange(token, password, passwordConfirmation);
                setDevCode(response.dev_code ?? "");
                setStep("code");
                setInfoMessage("Код отправлен на номер " + phone);
            } catch (error) {
                setInfoMessage("");
                if (error instanceof ApiRequestError) {
                    setErrorMessage(error.message);
                } else {
                    setErrorMessage("Не удалось отправить код");
                }
            }
        });
    };

    const handleVerify = () => {
        const token = getAuthToken();
        if (!token) {
            return;
        }

        setErrorMessage("");
        setInfoMessage("");

        startTransition(async () => {
            try {
                await verifyPasswordChange(token, code);
                onSuccessAction();
            } catch (error) {
                if (error instanceof ApiRequestError) {
                    setErrorMessage(error.message);
                } else {
                    setErrorMessage("Не удалось подтвердить код");
                }
            }
        });
    };

    if (!mounted) {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="max-h-[min(92vh,640px)] w-full max-w-md overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_90px_rgba(31,23,34,0.22)]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-change-title"
            >
                <div className="bg-gradient-to-br from-[var(--accent-hover)] to-[var(--accent)] px-6 py-5 text-[var(--background)]">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--background)]/60">
                                Безопасность
                            </div>
                            <h2
                                id="password-change-title"
                                className="mt-2 font-display text-2xl font-semibold leading-tight"
                            >
                                Смена пароля
                            </h2>
                        </div>

                        <button
                            type="button"
                            onClick={onCloseAction}
                            disabled={isPending}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black/10 text-xl leading-none text-[var(--background)] transition hover:bg-black/20 disabled:opacity-50"
                            aria-label="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="max-h-[calc(92vh-7rem)] overflow-y-auto p-6">
                    <p className="mb-5 text-sm leading-6 text-[var(--text-secondary)]">
                        Укажите новый пароль. Подтверждение придёт по SMS на {phone}.
                    </p>

                    {step === "form" ? (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                                    Новый пароль
                                </label>
                                <PasswordInput
                                    value={password}
                                    onChangeAction={setPassword}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                                    Повторите пароль
                                </label>
                                <PasswordInput
                                    value={passwordConfirmation}
                                    onChangeAction={setPasswordConfirmation}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={onCloseAction}
                                    disabled={isPending}
                                    className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-50"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRequestCode}
                                    disabled={isPending}
                                    className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
                                >
                                    {isPending ? "Отправка…" : "Подтвердить по SMS"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {infoMessage ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                    {infoMessage}
                                </div>
                            ) : null}

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                                    Код из SMS
                                </label>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className={inputClassName}
                                    placeholder="Введите код"
                                    inputMode="numeric"
                                    disabled={isPending}
                                />
                                <SmsDevHint value={devCode} label="Код подтверждения" />
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep("form");
                                        setCode("");
                                        setErrorMessage("");
                                        setInfoMessage("");
                                    }}
                                    disabled={isPending}
                                    className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-50"
                                >
                                    Назад
                                </button>
                                <button
                                    type="button"
                                    onClick={handleVerify}
                                    disabled={isPending || !code}
                                    className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
                                >
                                    {isPending ? "Проверка…" : "Сменить пароль"}
                                </button>
                            </div>
                        </div>
                    )}

                    {errorMessage ? (
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>,
        document.body
    );
}
