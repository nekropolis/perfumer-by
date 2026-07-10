"use client";

type ClientFormState = {
    first_name: string;
    last_name: string;
    patronymic: string;
    birth_date: string;
    phone: string;
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
    return digitsOnly(value).slice(0, 9);
}

function nationalFromStoredPhone(phone: string): string {
    const d = digitsOnly(phone);
    if (d.startsWith(PHONE_PREFIX)) return d.slice(PHONE_PREFIX.length, PHONE_PREFIX.length + 9);
    if (d.length >= 9) return d.slice(-9);
    return d.slice(0, 9);
}

function formatNationalDisplay(national: string): string {
    const d = clampNationalDigits(national);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
    if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7, 9)}`;
}

export default function ClientForm({
    form,
    submitting,
    submitLabel,
    isEdit = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    const nationalPhone = nationalFromStoredPhone(form.phone);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Имя</label>
                    <input
                        value={form.first_name}
                        onChange={(e) => onChangeAction({ ...form, first_name: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Фамилия</label>
                    <input
                        value={form.last_name}
                        onChange={(e) => onChangeAction({ ...form, last_name: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Отчество</label>
                    <input
                        value={form.patronymic}
                        onChange={(e) => onChangeAction({ ...form, patronymic: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Дата рождения</label>
                    <input
                        type="date"
                        value={form.birth_date}
                        onChange={(e) => onChangeAction({ ...form, birth_date: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">
                        Телефон <span className="text-rose-600">*</span>
                    </label>
                    <div className="flex w-full items-stretch overflow-hidden rounded-xl border bg-white">
                        <span className="flex shrink-0 items-center border-r bg-admin-muted px-3 text-sm text-admin-text-secondary">
                            +375
                        </span>
                        <input
                            value={formatNationalDisplay(nationalPhone)}
                            onChange={(e) => {
                                const national = clampNationalDigits(e.target.value);
                                onChangeAction({ ...form, phone: national ? `${PHONE_PREFIX}${national}` : "" });
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
                </div>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Email</label>
                    <input
                        value={form.email}
                        onChange={(e) => onChangeAction({ ...form, email: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
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
                            className="w-full rounded-xl border px-3 py-2 text-sm"
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
                                className="w-full rounded-xl border px-3 py-2 text-sm"
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

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className="rounded-full bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-60"
                >
                    {submitting ? "Сохранение..." : submitLabel}
                </button>
            </div>
        </div>
    );
}

export type { ClientFormState };
