"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

import { ADMIN_PHONE_MAX_DIGITS } from "@/lib/admin-phone-search";
import { isPlainByPhoneComplete } from "@/components/ui/phone-input";

type ClientFormState = {
    first_name: string;
    last_name: string;
    patronymic: string;
    birth_date: string;
    phone: string;
    additional_phone: string;
    email: string;
    password: string;
    passwordConfirmation: string;
};

type Props = {
    form: ClientFormState;
    submitting: boolean;
    submitLabel: string;
    isEdit?: boolean;
    onChangeAction: (next: ClientFormState) => void;
    onSubmitAction: () => void;
};

const PHONE_PREFIX = "375";

function digitsOnly(value: string): string {
    return value.replace(/\D+/g, "");
}

function clampNationalDigits(value: string): string {
    const d = digitsOnly(value);
    if (d.startsWith(PHONE_PREFIX)) {
        return d.slice(PHONE_PREFIX.length).slice(0, 9);
    }
    return d.slice(0, 9);
}

function shouldUsePlainPhoneUi(phone: string): boolean {
    const d = digitsOnly(phone);
    if (!d) return false;
    if (d.startsWith(PHONE_PREFIX) && d.length <= 12) return false;
    return true;
}

function formatNationalDisplay(national: string): string {
    const d = clampNationalDigits(national);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
    if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7, 9)}`;
}

export function isValidClientPhone(phone: string): boolean {
    const digits = digitsOnly(phone);
    if (isPlainByPhoneComplete(digits)) return true;
    return digits.length >= 12 && digits.startsWith(PHONE_PREFIX);
}

export function isValidOptionalClientPhone(phone: string): boolean {
    const digits = digitsOnly(phone);
    if (digits === "") return true;
    return isValidClientPhone(phone);
}

export default function ClientForm({
    form,
    submitting,
    submitLabel,
    isEdit = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    const plainMode = shouldUsePlainPhoneUi(form.phone);
    const nationalPhone = clampNationalDigits(form.phone);
    const plainAdditionalMode = shouldUsePlainPhoneUi(form.additional_phone);
    const nationalAdditionalPhone = clampNationalDigits(form.additional_phone);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Имя</label>
                    <input
                        value={form.first_name}
                        onChange={(e) => onChangeAction({ ...form, first_name: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Фамилия</label>
                    <input
                        value={form.last_name}
                        onChange={(e) => onChangeAction({ ...form, last_name: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Отчество</label>
                    <input
                        value={form.patronymic}
                        onChange={(e) => onChangeAction({ ...form, patronymic: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Дата рождения</label>
                    <input
                        type="date"
                        value={form.birth_date}
                        onChange={(e) => onChangeAction({ ...form, birth_date: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="block text-sm text-admin-text-secondary">
                            Телефон <span className="text-rose-600">*</span>
                        </label>
                        <button
                            type="button"
                            className="text-[11px] font-medium text-admin-primary hover:underline"
                            onClick={() => {
                                if (plainMode) {
                                    const d = digitsOnly(form.phone);
                                    const national = d.startsWith(PHONE_PREFIX)
                                        ? d.slice(PHONE_PREFIX.length).slice(0, 9)
                                        : "";
                                    onChangeAction({
                                        ...form,
                                        phone: national ? `${PHONE_PREFIX}${national}` : "",
                                    });
                                } else {
                                    onChangeAction({
                                        ...form,
                                        phone: digitsOnly(form.phone).slice(0, ADMIN_PHONE_MAX_DIGITS),
                                    });
                                }
                            }}
                        >
                            {plainMode ? "Белорусский" : "Международный"}
                        </button>
                    </div>
                    {plainMode ? (
                        <input
                            value={digitsOnly(form.phone)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    phone: e.target.value.replace(/\D/g, "").slice(0, ADMIN_PHONE_MAX_DIGITS),
                                })
                            }
                            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                            placeholder="79001234567"
                            inputMode="numeric"
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            required
                        />
                    ) : (
                        <div className="flex min-h-10 w-full items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-surface">
                            <span className="flex shrink-0 items-center border-r bg-admin-muted px-3 text-sm text-admin-text-secondary">
                                +375
                            </span>
                            <input
                                value={formatNationalDisplay(nationalPhone)}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, "");
                                    if (!raw.startsWith(PHONE_PREFIX) && raw.length >= 10) {
                                        onChangeAction({
                                            ...form,
                                            phone: raw.slice(0, ADMIN_PHONE_MAX_DIGITS),
                                        });
                                        return;
                                    }
                                    const national = clampNationalDigits(e.target.value);
                                    onChangeAction({
                                        ...form,
                                        phone: national ? `${PHONE_PREFIX}${national}` : "",
                                    });
                                }}
                                className="min-w-0 flex-1 border-0 px-3 py-2 text-sm outline-none ring-0 focus:ring-0"
                                placeholder="29 123-45-67"
                                inputMode="numeric"
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                required
                            />
                        </div>
                    )}
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="block text-sm text-admin-text-secondary">Доп. телефон</label>
                        <button
                            type="button"
                            className="text-[11px] font-medium text-admin-primary hover:underline"
                            onClick={() => {
                                if (plainAdditionalMode) {
                                    const d = digitsOnly(form.additional_phone);
                                    const national = d.startsWith(PHONE_PREFIX)
                                        ? d.slice(PHONE_PREFIX.length).slice(0, 9)
                                        : "";
                                    onChangeAction({
                                        ...form,
                                        additional_phone: national ? `${PHONE_PREFIX}${national}` : "",
                                    });
                                } else {
                                    onChangeAction({
                                        ...form,
                                        additional_phone: digitsOnly(form.additional_phone).slice(
                                            0,
                                            ADMIN_PHONE_MAX_DIGITS,
                                        ),
                                    });
                                }
                            }}
                        >
                            {plainAdditionalMode ? "Белорусский" : "Международный"}
                        </button>
                    </div>
                    {plainAdditionalMode ? (
                        <input
                            value={digitsOnly(form.additional_phone)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    additional_phone: e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, ADMIN_PHONE_MAX_DIGITS),
                                })
                            }
                            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                            placeholder="79001234567"
                            inputMode="numeric"
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    ) : (
                        <div className="flex min-h-10 w-full items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-surface">
                            <span className="flex shrink-0 items-center border-r bg-admin-muted px-3 text-sm text-admin-text-secondary">
                                +375
                            </span>
                            <input
                                value={formatNationalDisplay(nationalAdditionalPhone)}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, "");
                                    if (!raw.startsWith(PHONE_PREFIX) && raw.length >= 10) {
                                        onChangeAction({
                                            ...form,
                                            additional_phone: raw.slice(0, ADMIN_PHONE_MAX_DIGITS),
                                        });
                                        return;
                                    }
                                    const national = clampNationalDigits(e.target.value);
                                    onChangeAction({
                                        ...form,
                                        additional_phone: national ? `${PHONE_PREFIX}${national}` : "",
                                    });
                                }}
                                className="min-w-0 flex-1 border-0 px-3 py-2 text-sm outline-none ring-0 focus:ring-0"
                                placeholder="29 123-45-67"
                                inputMode="numeric"
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                        </div>
                    )}
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Email</label>
                    <input
                        value={form.email}
                        onChange={(e) => onChangeAction({ ...form, email: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>
                <div className={isEdit ? "md:col-span-2 grid gap-4 sm:grid-cols-2" : "md:col-span-2"}>
                    <div>
                        <label className="mb-1 block text-sm text-admin-text-secondary">
                            {isEdit ? "Новый пароль" : "Пароль (необязательно)"}
                        </label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) => onChangeAction({ ...form, password: e.target.value })}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            placeholder={isEdit ? "Оставьте пустым, чтобы не менять" : "Минимум 8 символов"}
                            autoComplete="new-password"
                        />
                    </div>
                    {isEdit ? (
                        <div>
                            <label className="mb-1 block text-sm text-admin-text-secondary">Повторите пароль</label>
                            <input
                                type="password"
                                value={form.passwordConfirmation}
                                onChange={(e) =>
                                    onChangeAction({ ...form, passwordConfirmation: e.target.value })
                                }
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                placeholder="Если меняете пароль"
                                autoComplete="new-password"
                            />
                        </div>
                    ) : null}
                    {isEdit ? (
                        <p className="sm:col-span-2 text-xs text-admin-text-secondary">
                            Смена пароля без SMS — только для администратора.
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className={`${adminBtnPrimary} w-full sm:w-auto`}
                >
                    {submitting ? "Сохранение..." : submitLabel}
                </button>
            </div>
        </div>
    );
}

export type { ClientFormState };
