"use client";

import { useEffect, useState, useTransition } from "react";
import { ApiRequestError, updateProfile, type AuthUserProfile } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";
import SiteDatePicker from "@/components/ui/site-date-picker";
import AccountPasswordChange from "@/components/account/account-password-change";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";

const labelClassName = "mb-1.5 block text-sm font-medium text-admin-text";

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

    const hasBirthDate = Boolean(user.birth_date);

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
                    ...(!hasBirthDate && birthDate ? { birth_date: birthDate } : {}),
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
        <div className={`${siteCard} p-6`}>
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                Редактирование
            </div>

            <h2 className="mt-2 text-xl font-semibold tracking-tight">Профиль</h2>

            <p className="mt-2 text-sm text-admin-text-secondary">
                Имя, фамилия и отчество можно менять в любое время. Телефон изменить здесь нельзя.
                {!hasBirthDate
                    ? " Дату рождения можно указать один раз."
                    : " Дату рождения изменить самостоятельно нельзя."}
            </p>

            <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <label className={labelClassName}>Имя</label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className={siteInput}
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
                            className={siteInput}
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
                            className={siteInput}
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
                            className={`${siteInput} cursor-not-allowed opacity-70`}
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={siteInput}
                            placeholder="email@example.com"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className={labelClassName}>Дата рождения</label>
                        <SiteDatePicker
                            value={birthDate}
                            onChangeAction={setBirthDate}
                            placeholder={hasBirthDate ? "" : "Выберите дату"}
                            disabled={hasBirthDate}
                        />
                        {hasBirthDate ? (
                            <p className="mt-1.5 text-xs text-admin-text-secondary">
                                Для изменения даты рождения обратитесь в магазин.
                            </p>
                        ) : null}
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
                    className={siteBtnPrimary}
                >
                    {isPending ? "Сохранение..." : "Сохранить"}
                </button>

                <button
                    type="button"
                    onClick={onCancelAction}
                    disabled={isPending}
                    className={siteBtnSecondary}
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}
