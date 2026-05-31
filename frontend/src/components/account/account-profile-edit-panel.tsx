"use client";

import { useEffect, useState, useTransition } from "react";
import { ApiRequestError, updateProfile, type AuthUserProfile } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";
import SiteDatePicker from "@/components/ui/site-date-picker";
import AccountPasswordChange from "@/components/account/account-password-change";

const inputClassName =
    "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)]";

const labelClassName = "mb-2 block text-sm font-medium";

type AccountProfileEditPanelProps = {
    user: AuthUserProfile;
    onSavedAction: () => void;
    onCancelAction: () => void;
};

export default function AccountProfileEditPanel({
    user,
    onSavedAction,
    onCancelAction,
}: AccountProfileEditPanelProps) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [patronymic, setPatronymic] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setFirstName(user.first_name ?? "");
        setLastName(user.last_name ?? "");
        setPatronymic(user.patronymic ?? "");
        setEmail(user.email ?? "");
        setBirthDate(user.birth_date ?? "");
        setErrorMessage("");
    }, [user]);

    const handleSubmit = () => {
        const token = getAuthToken();
        if (!token) {
            return;
        }

        setErrorMessage("");

        startTransition(async () => {
            try {
                await updateProfile(token, {
                    first_name: firstName.trim() || null,
                    last_name: lastName.trim() || null,
                    patronymic: patronymic.trim() || null,
                    email: email.trim() || null,
                    birth_date: birthDate || null,
                });

                onSavedAction();
            } catch (error) {
                if (error instanceof ApiRequestError) {
                    setErrorMessage(error.message);
                } else {
                    setErrorMessage("Не удалось сохранить данные");
                }
            }
        });
    };

    return (
        <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
            <div className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                Редактирование
            </div>

            <h2 className="mt-2 text-2xl font-semibold font-display">Профиль</h2>

            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Все поля необязательны. Телефон изменить здесь нельзя.
            </p>

            <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <label className={labelClassName}>Имя</label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className={inputClassName}
                            placeholder="Имя"
                            autoComplete="given-name"
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Фамилия</label>
                        <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className={inputClassName}
                            placeholder="Фамилия"
                            autoComplete="family-name"
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Отчество</label>
                        <input
                            type="text"
                            value={patronymic}
                            onChange={(e) => setPatronymic(e.target.value)}
                            className={inputClassName}
                            placeholder="Отчество"
                            autoComplete="additional-name"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <label className={labelClassName}>Телефон</label>
                        <input
                            type="text"
                            value={user.phone ?? ""}
                            readOnly
                            className={`${inputClassName} cursor-not-allowed opacity-70`}
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClassName}
                            placeholder="email@example.com"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Дата рождения</label>
                        <SiteDatePicker
                            value={birthDate}
                            onChangeAction={setBirthDate}
                            placeholder="Выберите дату"
                        />
                    </div>
                </div>

                {user.phone ? <AccountPasswordChange phone={user.phone} /> : null}
            </div>

            {errorMessage ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                    {isPending ? "Сохранение..." : "Сохранить"}
                </button>

                <button
                    type="button"
                    onClick={onCancelAction}
                    disabled={isPending}
                    className="rounded-2xl border border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-50"
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}
