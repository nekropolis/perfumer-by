"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
    ApiRequestError,
    forgotPassword,
    loginWithPassword,
    registerAccount,
    verifyRegistration,
} from "@/lib/auth-api";
import { useAuth } from "@/components/auth/auth-provider";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";
import { isPrivilegedRole } from "@/constants/admin-roles";
import RecaptchaNotice from "@/components/ui/recaptcha-notice";
import SmsDevHint from "@/components/ui/sms-dev-hint";
import PasswordInput from "@/components/ui/password-input";

declare global {
    interface Window {
        grecaptcha?: {
            ready: (cb: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

type Tab = "login" | "register";
type RegisterStep = "form" | "code";
type MessageTone = "error" | "success" | "default";

const inputClassName =
    "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]/40";

const labelClassName = "mb-1 block text-xs font-medium text-[var(--foreground)]";

type AuthModalProps = {
    open: boolean;
    onCloseAction: () => void;
    initialTab?: Tab;
};

export default function AuthModal({ open, onCloseAction, initialTab = "login" }: AuthModalProps) {
    const router = useRouter();
    const { login } = useAuth();

    const [mounted, setMounted] = useState(false);
    const [tab, setTab] = useState<Tab>(initialTab);
    const [registerStep, setRegisterStep] = useState<RegisterStep>("form");
    const [showForgot, setShowForgot] = useState(false);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState("");
    const [devPassword, setDevPassword] = useState("");

    const [message, setMessage] = useState("");
    const [messageTone, setMessageTone] = useState<MessageTone>("default");
    const [captchaSecurityNotice, setCaptchaSecurityNotice] = useState(false);
    const [isPending, startTransition] = useTransition();

    const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
    const phoneIsValid = isBelarusPhoneComplete(phone);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        setTab(initialTab);
        setRegisterStep("form");
        setShowForgot(false);
        setMessage("");
        setMessageTone("default");
        setCaptchaSecurityNotice(false);
    }, [open, initialTab]);

    useEffect(() => {
        if (!open) {
            return;
        }

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
    }, [open, onCloseAction, isPending]);

    useEffect(() => {
        if (!recaptchaSiteKey || typeof window === "undefined" || document.getElementById("recaptcha-v3-script")) {
            return;
        }

        const script = document.createElement("script");
        script.id = "recaptcha-v3-script";
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }, [recaptchaSiteKey]);

    const showMessage = (text: string, tone: MessageTone = "default") => {
        setMessage(text);
        setMessageTone(tone);
    };

    const clearMessage = () => {
        setMessage("");
        setMessageTone("default");
    };

    const messageToneClassName =
        messageTone === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : messageTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[var(--line)] text-[var(--foreground)]";

    const getRecaptchaToken = async (action: string): Promise<string | undefined> => {
        if (!recaptchaSiteKey || typeof window === "undefined" || !window.grecaptcha) {
            return undefined;
        }

        return await new Promise<string | undefined>((resolve) => {
            window.grecaptcha?.ready(async () => {
                try {
                    const token = await window.grecaptcha?.execute(recaptchaSiteKey, { action });
                    resolve(token || undefined);
                } catch {
                    resolve(undefined);
                }
            });
        });
    };

    const getFriendlyAuthError = (error: unknown, fallback: string): string => {
        if (error instanceof ApiRequestError) {
            if (error.code === "auth.captcha.required" || error.code === "auth.captcha.failed") {
                setCaptchaSecurityNotice(true);
                return "Подтвердите, что вы не робот, и повторите запрос.";
            }
            setCaptchaSecurityNotice(false);

            if (error.code === "auth.register.user_exists") {
                return error.message;
            }
            if (
                error.code === "auth.otp.request.cooldown" ||
                error.code === "auth.otp.request.phone_limit_15m" ||
                error.code === "auth.otp.request.ip_phone_limit_15m" ||
                error.code === "auth.otp.request.ip_limit_15m"
            ) {
                return error.message;
            }

            return error.message || fallback;
        }

        setCaptchaSecurityNotice(false);
        return error instanceof Error ? error.message || fallback : fallback;
    };

    const completeAuth = async (token: string, authUser: { id: number; name: string | null; phone: string; role?: string }) => {
        await login(token, authUser);
        onCloseAction();
        if (isPrivilegedRole(authUser.role)) {
            router.push("/admin");
        } else {
            router.push("/account");
        }
    };

    const handleLogin = () => {
        clearMessage();
        if (!phoneIsValid) {
            showMessage("Введите корректный номер телефона", "error");
            return;
        }
        if (!password) {
            showMessage("Введите пароль", "error");
            return;
        }

        startTransition(async () => {
            try {
                const captchaToken = await getRecaptchaToken("login");
                const response = await loginWithPassword(phone, password, captchaToken);
                await completeAuth(response.token, response.user);
            } catch (error) {
                showMessage(getFriendlyAuthError(error, "Не удалось войти"), "error");
            }
        });
    };

    const handleRegister = () => {
        clearMessage();
        if (!name.trim()) {
            showMessage("Введите имя", "error");
            return;
        }
        if (!phoneIsValid) {
            showMessage("Введите корректный номер телефона", "error");
            return;
        }
        if (password.length < 8) {
            showMessage("Пароль должен быть не короче 8 символов", "error");
            return;
        }
        if (password !== passwordConfirmation) {
            showMessage("Пароли не совпадают", "error");
            return;
        }

        startTransition(async () => {
            try {
                const captchaToken = await getRecaptchaToken("register");
                const response = await registerAccount(
                    name.trim(),
                    phone,
                    password,
                    passwordConfirmation,
                    captchaToken
                );
                setDevCode(response.dev_code ?? "");
                setRegisterStep("code");
                showMessage(response.message || "Код подтверждения отправлен", "success");
            } catch (error) {
                const text = getFriendlyAuthError(error, "Не удалось зарегистрироваться");
                showMessage(text, "error");
                if (error instanceof ApiRequestError && error.code === "auth.register.user_exists") {
                    setTab("login");
                    setRegisterStep("form");
                }
            }
        });
    };

    const handleRegisterVerify = () => {
        clearMessage();
        startTransition(async () => {
            try {
                const response = await verifyRegistration(phone, code);
                await completeAuth(response.token, response.user);
            } catch (error) {
                showMessage(getFriendlyAuthError(error, "Неверный код"), "error");
            }
        });
    };

    const handleForgotPassword = () => {
        clearMessage();
        if (!phoneIsValid) {
            showMessage("Введите корректный номер телефона", "error");
            return;
        }

        startTransition(async () => {
            try {
                const captchaToken = await getRecaptchaToken("forgot_password");
                const response = await forgotPassword(phone, captchaToken);
                const newPassword = response.dev_password ?? "";
                setDevPassword(newPassword);
                if (newPassword) {
                    setPassword(newPassword);
                }
                showMessage(
                    newPassword
                        ? "Новый пароль сгенерирован. Войдите с ним — позже смените в личном кабинете."
                        : "Новый пароль отправлен по SMS. Его можно сменить в личном кабинете.",
                    "success"
                );
                setShowForgot(false);
                setTab("login");
            } catch (error) {
                showMessage(getFriendlyAuthError(error, "Не удалось восстановить пароль"), "error");
            }
        });
    };

    const switchTab = (nextTab: Tab) => {
        setTab(nextTab);
        setRegisterStep("form");
        setShowForgot(false);
        clearMessage();
        setDevCode("");
        setDevPassword("");
    };

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="flex max-h-[min(94vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_90px_rgba(31,23,34,0.22)] sm:max-h-[min(92vh,720px)] sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-modal-title"
            >
                <div className="shrink-0 bg-gradient-to-br from-[var(--accent-hover)] to-[var(--accent)] px-4 py-3 text-[var(--background)] sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2">
                        {!showForgot && registerStep === "form" ? (
                            <div
                                className="flex min-w-0 flex-1 rounded-xl border border-black/15 bg-black/10 p-1"
                                role="tablist"
                                aria-label="Аккаунт"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === "login"}
                                    id="auth-modal-title"
                                    onClick={() => switchTab("login")}
                                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                                        tab === "login"
                                            ? "bg-[var(--background)] text-[var(--accent)]"
                                            : "text-[var(--background)]/70 hover:text-[var(--background)]"
                                    }`}
                                >
                                    Войти
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === "register"}
                                    onClick={() => switchTab("register")}
                                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                                        tab === "register"
                                            ? "bg-[var(--background)] text-[var(--accent)]"
                                            : "text-[var(--background)]/70 hover:text-[var(--background)]"
                                    }`}
                                >
                                    Регистрация
                                </button>
                            </div>
                        ) : (
                            <p id="auth-modal-title" className="min-w-0 flex-1 text-sm font-semibold">
                                {showForgot ? "Забыли пароль?" : "Код из SMS"}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={onCloseAction}
                            disabled={isPending}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/10 text-lg leading-none text-[var(--background)] transition hover:bg-black/20 disabled:opacity-50"
                            aria-label="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                    {showForgot ? (
                        <div className="space-y-3">
                            <p className="text-xs text-[var(--text-secondary)]">Новый пароль придёт по SMS.</p>
                            <div>
                                <label className={labelClassName}>Телефон</label>
                                <PhoneInput value={phone} onChangeAction={setPhone} />
                            </div>
                            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForgot(false);
                                        clearMessage();
                                    }}
                                    disabled={isPending}
                                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-50"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    disabled={isPending}
                                    className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                                >
                                    {isPending ? "Отправка…" : "Отправить SMS"}
                                </button>
                            </div>
                        </div>
                    ) : tab === "login" ? (
                        <div className="space-y-3">
                            <div>
                                <label className={labelClassName}>Телефон</label>
                                <PhoneInput value={phone} onChangeAction={setPhone} />
                            </div>
                            <div>
                                <label className={labelClassName}>Пароль</label>
                                <PasswordInput
                                    value={password}
                                    onChangeAction={(next) => {
                                        setPassword(next);
                                        if (devPassword && next !== devPassword) {
                                            setDevPassword("");
                                        }
                                    }}
                                    autoComplete="current-password"
                                />
                                <SmsDevHint value={devPassword} label="Новый пароль" />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForgot(true);
                                    clearMessage();
                                    setDevPassword("");
                                }}
                                className="text-sm font-medium text-[var(--accent)] underline decoration-[var(--accent-soft)] underline-offset-[3px]"
                            >
                                Забыли пароль?
                            </button>
                            <button
                                type="button"
                                onClick={handleLogin}
                                disabled={isPending}
                                className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                            >
                                {isPending ? "Вход…" : "Войти"}
                            </button>
                        </div>
                    ) : registerStep === "form" ? (
                        <div className="space-y-3">
                            <div>
                                <label className={labelClassName}>Имя</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={inputClassName}
                                    placeholder="Ваше имя"
                                    autoComplete="given-name"
                                />
                            </div>
                            <div>
                                <label className={labelClassName}>Телефон</label>
                                <PhoneInput value={phone} onChangeAction={setPhone} />
                            </div>
                            <div>
                                <label className={labelClassName}>Пароль</label>
                                <PasswordInput
                                    value={password}
                                    onChangeAction={setPassword}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div>
                                <label className={labelClassName}>
                                    Повторите пароль
                                </label>
                                <PasswordInput
                                    value={passwordConfirmation}
                                    onChangeAction={setPasswordConfirmation}
                                    autoComplete="new-password"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleRegister}
                                disabled={isPending}
                                className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                            >
                                {isPending ? "Отправка…" : "Зарегистрироваться"}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
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
                            <button
                                type="button"
                                onClick={handleRegisterVerify}
                                disabled={isPending || !code}
                                className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                            >
                                {isPending ? "Проверка…" : "Подтвердить"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setRegisterStep("form");
                                    clearMessage();
                                }}
                                disabled={isPending}
                                className="w-full rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-semibold transition hover:bg-[var(--background)] disabled:opacity-50"
                            >
                                Назад
                            </button>
                        </div>
                    )}

                    {message ? (
                        <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${messageToneClassName}`}>
                            {message}
                        </div>
                    ) : null}

                    {captchaSecurityNotice ? (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Включена дополнительная проверка безопасности.
                        </div>
                    ) : null}

                    {recaptchaSiteKey ? (
                        <RecaptchaNotice className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]" />
                    ) : null}
                </div>

                <div className="shrink-0 border-t border-[var(--line)] px-4 py-2 text-center">
                    <Link
                        href="/"
                        onClick={onCloseAction}
                        className="text-xs text-[var(--accent)] transition hover:underline"
                    >
                        На главную
                    </Link>
                </div>
            </div>
        </div>,
        document.body
    );
}
