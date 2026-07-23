"use client";

import { X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ApiRequestError, requestPasswordChange, verifyPasswordChange } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";
import SmsDevHint from "@/components/ui/sms-dev-hint";
import PasswordInput from "@/components/ui/password-input";
import { siteBtnGhost, siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";

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
            className="fixed inset-0 z-[200] flex items-end justify-center bg-admin-text/40 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className={`${siteCard} max-h-[min(92vh,640px)] w-full max-w-md overflow-hidden shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-change-title"
            >
                <div className="border-b border-admin-border px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 id="password-change-title" className="text-lg font-semibold tracking-tight text-admin-text">
                                Смена пароля
                            </h2>
                            <p className="mt-1 text-sm text-admin-text-secondary">
                                Подтверждение придёт по SMS на {phone}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCloseAction}
                            disabled={isPending}
                            className={`${siteBtnGhost} h-9 w-9 shrink-0 p-0`}
                            aria-label="Закрыть"
                        >
                            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                        </button>
                    </div>
                </div>

                <div className="max-h-[calc(92vh-7rem)] overflow-y-auto p-5 sm:p-6">
                    {step === "form" ? (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-admin-text">Новый пароль</label>
                                <PasswordInput
                                    value={password}
                                    onChangeAction={setPassword}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-admin-text">
                                    Повторите пароль
                                </label>
                                <PasswordInput
                                    value={passwordConfirmation}
                                    onChangeAction={setPasswordConfirmation}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={onCloseAction} disabled={isPending} className={siteBtnSecondary}>
                                    Отмена
                                </button>
                                <button type="button" onClick={handleRequestCode} disabled={isPending} className={siteBtnPrimary}>
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
                                <label className="mb-1.5 block text-sm font-medium text-admin-text">Код из SMS</label>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className={siteInput}
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
                                    className={siteBtnSecondary}
                                >
                                    Назад
                                </button>
                                <button
                                    type="button"
                                    onClick={handleVerify}
                                    disabled={isPending || !code}
                                    className={siteBtnPrimary}
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
