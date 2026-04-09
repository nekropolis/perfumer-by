"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestPhoneCode, verifyPhoneCode } from "@/lib/auth-api";
import { useAuth } from "@/components/auth/auth-provider";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";
import {isPrivilegedRole} from "@/constants/admin-roles";

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [step, setStep] = useState<"phone" | "code">("phone");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    const phoneIsValid = isBelarusPhoneComplete(phone);

    const handleRequestCode = () => {
        setMessage("");

        if (!phoneIsValid) {
            setMessage("Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX");
            return;
        }

        startTransition(async () => {
            try {
                const response = await requestPhoneCode(phone);
                setDevCode(response.dev_code);
                setStep("code");
            } catch (error) {
                console.error(error);
                setMessage("Не удалось запросить код");
            }
        });
    };

    const handleVerifyCode = () => {
        setMessage("");

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
                setMessage("Неверный код или ошибка авторизации");
            }
        });
    };

    return (
        <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border p-6">
                <h1 className="mb-6 text-3xl font-semibold">Вход по телефону</h1>

                {step === "phone" && (
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Имя</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-xl border px-4 py-3"
                                placeholder="Ваше имя"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Телефон</label>
                            <PhoneInput value={phone} onChange={setPhone} />
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
                                className="w-full rounded-xl border px-4 py-3"
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
            </div>
        </main>
    );
}