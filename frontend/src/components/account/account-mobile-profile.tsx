"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import AccountPasswordChangeModal from "@/components/account/account-password-change-modal";
import SiteDatePicker from "@/components/ui/site-date-picker";
import { ApiRequestError, updateProfile, type AuthUserProfile } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";
import { formatBelarusPhoneSpaced } from "@/lib/site-contact";
import { siteBtnPrimary, siteInput } from "@/lib/site-ui-classes";

type EditableField = "first_name" | "last_name" | "patronymic" | "email" | "birth_date";

type AccountMobileProfileProps = {
    user: AuthUserProfile;
    onCloseAction: () => void;
    onSavedAction: () => void;
};

function formatBirthDate(value?: string | null): string {
    if (!value) {
        return "";
    }
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) {
        return value;
    }
    return `${day}.${month}.${year}`;
}

function fieldValue(user: AuthUserProfile, key: EditableField | "phone"): string {
    if (key === "phone") {
        return user.phone ? formatBelarusPhoneSpaced(user.phone) : "";
    }
    if (key === "birth_date") {
        return formatBirthDate(user.birth_date);
    }
    return user[key]?.trim() ?? "";
}

const rows: Array<{ key: EditableField | "phone" | "password"; label: string }> = [
    { key: "first_name", label: "Имя" },
    { key: "last_name", label: "Фамилия" },
    { key: "patronymic", label: "Отчество" },
    { key: "phone", label: "Телефон" },
    { key: "email", label: "Email" },
    { key: "birth_date", label: "Дата рождения" },
    { key: "password", label: "Пароль" },
];

export default function AccountMobileProfile({ user, onCloseAction, onSavedAction }: AccountMobileProfileProps) {
    const [editing, setEditing] = useState<EditableField | null>(null);
    const [draft, setDraft] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [passwordSaved, setPasswordSaved] = useState(false);
    const [isPending, startTransition] = useTransition();

    const birthLocked = Boolean(user.birth_date);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const canEdit = (key: (typeof rows)[number]["key"]) => {
        if (key === "phone") {
            return false;
        }
        if (key === "birth_date") {
            return !birthLocked;
        }
        return true;
    };

    const openField = (key: EditableField) => {
        setErrorMessage("");
        setDraft(key === "birth_date" ? (user.birth_date ?? "") : (user[key]?.trim() ?? ""));
        setEditing(key);
    };

    const saveField = () => {
        if (!editing) {
            return;
        }
        const token = getAuthToken();
        if (!token) {
            return;
        }

        const value = draft.trim();
        if (editing === "birth_date" && !value) {
            setErrorMessage("Выберите дату рождения");
            return;
        }

        setErrorMessage("");
        startTransition(async () => {
            try {
                await updateProfile(token, {
                    [editing]: value || null,
                });
                onSavedAction();
                setEditing(null);
            } catch (error) {
                setErrorMessage(error instanceof ApiRequestError ? error.message : "Не удалось сохранить данные");
            }
        });
    };

    const editingLabel = rows.find((row) => row.key === editing)?.label ?? "Профиль";

    return createPortal(
        <div
            className="fixed inset-x-0 z-[145] flex flex-col bg-admin-bg md:hidden"
            style={{
                top: "var(--storefront-header-row-height, 52px)",
                bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
            }}
        >
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-admin-border bg-admin-surface px-1">
                <button
                    type="button"
                    onClick={() => (editing ? setEditing(null) : onCloseAction())}
                    aria-label="Назад"
                    className="inline-flex h-11 w-11 items-center justify-center text-admin-text"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <div className="min-w-0 truncate text-base font-semibold text-admin-text">
                    {editing ? editingLabel : "Профиль"}
                </div>
            </div>

            {editing ? (
                <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
                    {editing === "birth_date" ? (
                        <p className="text-sm text-admin-text-secondary">Дату рождения можно указать один раз.</p>
                    ) : null}
                    <div className="mt-4">
                        {editing === "birth_date" ? (
                            <SiteDatePicker
                                value={draft}
                                onChangeAction={setDraft}
                                placeholder="Выберите дату"
                            />
                        ) : (
                            <input
                                type={editing === "email" ? "email" : "text"}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                autoFocus
                                autoComplete={
                                    editing === "email"
                                        ? "email"
                                        : editing === "first_name"
                                          ? "given-name"
                                          : editing === "last_name"
                                            ? "family-name"
                                            : "additional-name"
                                }
                                className={`${siteInput} min-h-12 text-base`}
                                placeholder={editingLabel}
                            />
                        )}
                    </div>
                    {errorMessage ? (
                        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={saveField}
                        disabled={isPending}
                        className={`${siteBtnPrimary} mt-auto min-h-12 w-full text-base`}
                    >
                        {isPending ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <ul className="divide-y divide-admin-border bg-admin-surface">
                        {rows.map((row) => {
                            const editable = canEdit(row.key);
                            const value =
                                row.key === "password"
                                    ? ""
                                    : fieldValue(user, row.key);
                            const hint =
                                row.key === "phone"
                                    ? "Нельзя изменить"
                                    : row.key === "birth_date" && birthLocked
                                      ? "Нельзя изменить"
                                      : null;

                            return (
                                <li key={row.key}>
                                    <button
                                        type="button"
                                        disabled={!editable}
                                        onClick={() => {
                                            if (row.key === "password") {
                                                setPasswordSaved(false);
                                                setPasswordOpen(true);
                                                return;
                                            }
                                            if (editable && row.key !== "phone") {
                                                openField(row.key);
                                            }
                                        }}
                                        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                                    >
                                        <span className="w-28 shrink-0 text-sm text-admin-text-secondary">{row.label}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className={`block truncate text-sm ${value ? "text-admin-text" : "text-admin-text-muted"}`}>
                                                {row.key === "password"
                                                    ? passwordSaved
                                                        ? "Пароль изменён"
                                                        : "Сменить"
                                                    : value || "Не указано"}
                                            </span>
                                            {hint ? (
                                                <span className="mt-0.5 block text-xs text-admin-text-muted">{hint}</span>
                                            ) : null}
                                        </span>
                                        {editable ? (
                                            <ChevronRight className="h-4 w-4 shrink-0 text-admin-text-muted" aria-hidden />
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {passwordOpen && user.phone ? (
                <AccountPasswordChangeModal
                    phone={user.phone}
                    onCloseAction={() => setPasswordOpen(false)}
                    onSuccessAction={() => {
                        setPasswordOpen(false);
                        setPasswordSaved(true);
                    }}
                />
            ) : null}
        </div>,
        document.body,
    );
}
