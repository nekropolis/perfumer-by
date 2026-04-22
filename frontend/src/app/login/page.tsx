"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ApiRequestError, requestPhoneCode, verifyPhoneCode } from "@/lib/auth-api";
import { useAuth } from "@/components/auth/auth-provider";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";
import {isPrivilegedRole} from "@/constants/admin-roles";

declare global {
    interface Window {
        grecaptcha?: {
            ready: (cb: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [step, setStep] = useState<"phone" | "code">("phone");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState("");
    const [message, setMessage] = useState("");
    const [captchaSecurityNotice, setCaptchaSecurityNotice] = useState(false);
    const [isPending, startTransition] = useTransition();
    const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

    const phoneIsValid = isBelarusPhoneComplete(phone);

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

    const getRecaptchaToken = async (): Promise<string | undefined> => {
        if (!recaptchaSiteKey || typeof window === "undefined" || !window.grecaptcha) {
            return undefined;
        }

        return await new Promise<string | undefined>((resolve) => {
            window.grecaptcha?.ready(async () => {
                try {
                    const token = await window.grecaptcha?.execute(recaptchaSiteKey, { action: "request_code" });
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
            if (error.code === "auth.otp.request.cooldown") {
                return error.message;
            }
            if (error.code === "auth.otp.request.phone_limit_15m" || error.code === "auth.otp.request.phone_limit_day") {
                return "Слишком часто запрашиваете код для этого номера. Попробуйте позже.";
            }
            if (error.code === "auth.otp.request.ip_limit_15m" || error.code === "auth.otp.request.ip_phone_limit_15m") {
                return "Слишком много запросов с вашего устройства. Попробуйте позже.";
            }
            if (error.code === "auth.otp.verify.blocked") {
                return "Слишком много неверных попыток. Попробуйте позже.";
            }
            if (error.code === "auth.otp.verify.invalid_code" || error.code === "auth.otp.verify.expired") {
                return error.message;
            }

            return error.message || fallback;
        }

        if (error instanceof Error) {
            setCaptchaSecurityNotice(false);
            return error.message || fallback;
        }

        setCaptchaSecurityNotice(false);
        return fallback;
    };

    const handleRequestCode = () => {
        setMessage("");
        setCaptchaSecurityNotice(false);

        if (!phoneIsValid) {
            setMessage("Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX");
            return;
        }

        startTransition(async () => {
            try {
                const captchaToken = await getRecaptchaToken();
                const response = await requestPhoneCode(phone, captchaToken);
                setDevCode(response.dev_code ?? "");
                if (response.delivery_channel === "manual" && response.dev_code) {
                    setMessage(`Viber/SMS недоступны. Временный код: ${response.dev_code}`);
                }
                setStep("code");
            } catch (error) {
                console.error(error);
                setMessage(getFriendlyAuthError(error, "Не удалось запросить код"));
            }
        });
    };

    const handleVerifyCode = () => {
        setMessage("");
        setCaptchaSecurityNotice(false);

        startTransition(async () => {
            try {
                const response = await verifyPhoneCode(phone, code, name);

                await login(response.token, {
                    id: response.user.id,
                    name: response.user.name,
                    phone: response.user.phone,
                    role: response.user.role,
                });

                if (isPrivilegedRole(response.user.role)) {
                    router.push("/admin");
                } else {
                    router.push("/account");
                }
            } catch (error) {
                console.error(error);
                setMessage(getFriendlyAuthError(error, "Неверный код или ошибка авторизации"));
            }
        });
    };

    return (
        <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                <h1 className="mb-6 text-3xl font-semibold">Вход по телефону</h1>

                {step === "phone" && (
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Имя</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-secondary)]"
                                placeholder="Ваше имя"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Телефон</label>
                            <PhoneInput value={phone} onChangeAction={setPhone} />
                        </div>

                        <button
                            type="button"
                            onClick={handleRequestCode}
                            disabled={isPending || !phone}
                            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                        >
                            {isPending ? "Отправка..." : "Получить код"}
                        </button>
                    </div>
                )}

                {step === "code" && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                            DEV код: <strong>{devCode}</strong>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Код</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-secondary)]"
                                placeholder="Введите код"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleVerifyCode}
                            disabled={isPending || !code}
                            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                        >
                            {isPending ? "Проверка..." : "Подтвердить"}
                        </button>
                    </div>
                )}

                {message && (
                    <div className="mt-4 rounded-xl border px-4 py-3 text-sm text-gray-700">
                        {message}
                    </div>
                )}

                {captchaSecurityNotice && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Включена дополнительная проверка безопасности. Это нормально при частых попытках входа.
                    </div>
                )}
            </div>
        </main>
    );
}