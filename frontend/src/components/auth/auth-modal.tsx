"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
    ApiRequestError,
    forgotPassword,
    loginWithPassword,
    registerAccount,
    verifyRegistration,
    type AuthSuccessResponse,
    type AuthUserProfile,
} from "@/lib/auth-api";
import { useAuth } from "@/components/auth/auth-provider";
import { siteBtnGhost, siteBtnPrimary, siteBtnSecondary, siteInput } from "@/lib/site-ui-classes";
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

const labelClassName = "mb-1.5 block text-sm font-medium text-admin-text";

type AuthModalProps = {
    open: boolean;
    onCloseAction: () => void;
    initialTab?: Tab;
};

function AuthTabButton({
    active,
    onClick,
    children,
    id,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    id?: string;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            id={id}
            onClick={onClick}
            className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                active
                    ? "bg-admin-surface text-admin-text shadow-sm ring-1 ring-admin-border"
                    : "text-admin-text-secondary hover:text-admin-text"
            }`}
        >
            {children}
        </button>
    );
}

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

    const headerTitle = showForgot
        ? "Восстановление пароля"
        : registerStep === "code"
          ? "Подтверждение SMS"
          : tab === "login"
            ? "Вход в аккаунт"
            : "Регистрация";

    const headerSubtitle = showForgot
        ? "Новый пароль придёт по SMS на ваш номер"
        : registerStep === "code"
          ? "Введите код из сообщения"
          : tab === "login"
            ? "Заказы, профиль и карта лояльности"
            : "Создайте аккаунт за минуту";

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
              : "border-admin-border bg-admin-muted text-admin-text";

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

    const toAuthProfile = (user: AuthSuccessResponse["user"]): AuthUserProfile => ({
        id: user.id,
        name: user.name,
        phone: user.phone ?? null,
        email: user.email ?? null,
        role: user.role,
        actor_type: user.actor_type ?? "client",
    });

    const completeAuth = async (token: string, authUser: AuthUserProfile) => {
        await login(token, authUser);
        onCloseAction();
        if (isPrivilegedRole(authUser)) {
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
                await completeAuth(response.token, toAuthProfile(response.user));
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
                await completeAuth(response.token, toAuthProfile(response.user));
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
            className="fixed inset-0 z-[200] flex items-end justify-center bg-admin-text/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="flex max-h-[min(94vh,720px)] w-full max-w-[420px] flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:max-h-[min(92vh,720px)] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-modal-title"
            >
                <div className="shrink-0 border-b border-admin-border px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 id="auth-modal-title" className="text-lg font-semibold tracking-tight text-admin-text">
                                {headerTitle}
                            </h2>
                            <p className="mt-1 text-sm text-admin-text-secondary">{headerSubtitle}</p>
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

                    {!showForgot && registerStep === "form" ? (
                        <div
                            className="mt-4 flex rounded-lg bg-admin-muted p-1"
                            role="tablist"
                            aria-label="Аккаунт"
                        >
                            <AuthTabButton active={tab === "login"} onClick={() => switchTab("login")}>
                                Войти
                            </AuthTabButton>
                            <AuthTabButton active={tab === "register"} onClick={() => switchTab("register")}>
                                Регистрация
                            </AuthTabButton>
                        </div>
                    ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                    {showForgot ? (
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleForgotPassword();
                            }}
                            noValidate
                        >
                            <div>
                                <label htmlFor="auth-forgot-phone" className={labelClassName}>
                                    Телефон
                                </label>
                                <PhoneInput
                                    id="auth-forgot-phone"
                                    name="phone"
                                    value={phone}
                                    onChangeAction={setPhone}
                                    autoComplete="tel-national"
                                    disabled={isPending}
                                />
                            </div>
                            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForgot(false);
                                        clearMessage();
                                    }}
                                    disabled={isPending}
                                    className={siteBtnSecondary}
                                >
                                    Отмена
                                </button>
                                <button type="submit" disabled={isPending} className={siteBtnPrimary}>
                                    {isPending ? "Отправка…" : "Отправить SMS"}
                                </button>
                            </div>
                        </form>
                    ) : tab === "login" ? (
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleLogin();
                            }}
                            noValidate
                        >
                            <div className="relative">
                                <label htmlFor="auth-login-phone" className={labelClassName}>
                                    Телефон
                                </label>
                                {/* Полный E.164 для менеджеров паролей; видимое поле — национальная часть после +375. */}
                                <input
                                    type="tel"
                                    name="username"
                                    autoComplete="username"
                                    value={phone ? `+${phone}` : ""}
                                    tabIndex={-1}
                                    aria-hidden
                                    className="absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, "");
                                        if (!digits) {
                                            setPhone("");
                                            return;
                                        }
                                        const normalized = digits.startsWith("375")
                                            ? digits.slice(0, 12)
                                            : `375${digits.slice(0, 9)}`;
                                        setPhone(normalized);
                                    }}
                                />
                                <PhoneInput
                                    id="auth-login-phone"
                                    name="phone"
                                    value={phone}
                                    onChangeAction={setPhone}
                                    autoComplete="tel-national"
                                    disabled={isPending}
                                />
                            </div>
                            <div>
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <label htmlFor="auth-login-password" className="text-sm font-medium text-admin-text">
                                        Пароль
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowForgot(true);
                                            clearMessage();
                                            setDevPassword("");
                                        }}
                                        className="text-xs font-medium text-admin-primary hover:underline"
                                    >
                                        Забыли пароль?
                                    </button>
                                </div>
                                <PasswordInput
                                    id="auth-login-password"
                                    name="password"
                                    value={password}
                                    onChangeAction={(next) => {
                                        setPassword(next);
                                        if (devPassword && next !== devPassword) {
                                            setDevPassword("");
                                        }
                                    }}
                                    autoComplete="current-password"
                                    disabled={isPending}
                                    onEnterAction={handleLogin}
                                />
                                <SmsDevHint value={devPassword} label="Новый пароль" />
                            </div>
                            <button type="submit" disabled={isPending} className={`${siteBtnPrimary} w-full`}>
                                {isPending ? "Вход…" : "Войти"}
                            </button>
                        </form>
                    ) : registerStep === "form" ? (
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleRegister();
                            }}
                            noValidate
                        >
                            <div>
                                <label htmlFor="auth-register-name" className={labelClassName}>
                                    Имя
                                </label>
                                <input
                                    id="auth-register-name"
                                    name="given-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={siteInput}
                                    placeholder="Ваше имя"
                                    autoComplete="given-name"
                                    disabled={isPending}
                                />
                            </div>
                            <div>
                                <label htmlFor="auth-register-phone" className={labelClassName}>
                                    Телефон
                                </label>
                                <PhoneInput
                                    id="auth-register-phone"
                                    name="phone"
                                    value={phone}
                                    onChangeAction={setPhone}
                                    autoComplete="tel-national"
                                    disabled={isPending}
                                />
                            </div>
                            <div>
                                <label htmlFor="auth-register-password" className={labelClassName}>
                                    Пароль
                                </label>
                                <PasswordInput
                                    id="auth-register-password"
                                    name="new-password"
                                    value={password}
                                    onChangeAction={setPassword}
                                    autoComplete="new-password"
                                    disabled={isPending}
                                />
                            </div>
                            <div>
                                <label htmlFor="auth-register-password-confirm" className={labelClassName}>
                                    Повторите пароль
                                </label>
                                <PasswordInput
                                    id="auth-register-password-confirm"
                                    name="new-password-confirm"
                                    value={passwordConfirmation}
                                    onChangeAction={setPasswordConfirmation}
                                    autoComplete="new-password"
                                    disabled={isPending}
                                    onEnterAction={handleRegister}
                                />
                            </div>
                            <button type="submit" disabled={isPending} className={`${siteBtnPrimary} w-full`}>
                                {isPending ? "Отправка…" : "Зарегистрироваться"}
                            </button>
                        </form>
                    ) : (
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleRegisterVerify();
                            }}
                            noValidate
                        >
                            <div>
                                <label htmlFor="auth-register-code" className={labelClassName}>
                                    Код из SMS
                                </label>
                                <input
                                    id="auth-register-code"
                                    name="one-time-code"
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className={siteInput}
                                    placeholder="Введите код"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    disabled={isPending}
                                />
                                <SmsDevHint value={devCode} label="Код подтверждения" />
                            </div>
                            <button
                                type="submit"
                                disabled={isPending || !code}
                                className={`${siteBtnPrimary} w-full`}
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
                                className={`${siteBtnSecondary} w-full`}
                            >
                                Назад
                            </button>
                        </form>
                    )}

                    {message ? (
                        <div className={`mt-4 rounded-2xl border px-3 py-2.5 text-sm ${messageToneClassName}`}>
                            {message}
                        </div>
                    ) : null}

                    {captchaSecurityNotice ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Включена дополнительная проверка безопасности.
                        </div>
                    ) : null}

                    {recaptchaSiteKey ? (
                        <RecaptchaNotice className="mt-4 text-[10px] leading-4 text-admin-text-muted" />
                    ) : null}
                </div>
            </div>
        </div>,
        document.body
    );
}
