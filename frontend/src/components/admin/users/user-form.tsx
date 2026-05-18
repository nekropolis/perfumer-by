"use client";

type UserFormState = {
    name: string;
    phone: string;
    email: string;
    role: string;
    password: string;
    passwordConfirmation: string;
};

type Props = {
    form: UserFormState;
    submitting: boolean;
    submitLabel: string;
    showRole?: boolean;
    isEdit?: boolean;
    onChangeAction: (next: UserFormState) => void;
    onSubmitAction: () => void;
};

const ROLES = ["customer", "admin", "manager", "ceo"] as const;
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

export default function UserForm({
    form,
    submitting,
    submitLabel,
    showRole = true,
    isEdit = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    const nationalPhone = nationalFromStoredPhone(form.phone);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm text-gray-600">Имя</label>
                    <input
                        value={form.name}
                        onChange={(e) => onChangeAction({ ...form, name: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm text-gray-600">Телефон</label>
                    <div className="flex w-full items-stretch overflow-hidden rounded-xl border bg-white">
                        <span className="flex shrink-0 items-center border-r bg-gray-50 px-3 text-sm text-gray-600">
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
                        />
                    </div>
                </div>
                <div>
                    <label className="mb-1 block text-sm text-gray-600">Email</label>
                    <input
                        value={form.email}
                        onChange={(e) => onChangeAction({ ...form, email: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                {showRole ? (
                    <div>
                        <label className="mb-1 block text-sm text-gray-600">Роль</label>
                        <select
                            value={form.role}
                            onChange={(e) => onChangeAction({ ...form, role: e.target.value })}
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                        >
                            {ROLES.map((role) => (
                                <option key={role} value={role}>
                                    {role}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
                <div className={isEdit ? "md:col-span-2 grid gap-4 sm:grid-cols-2" : "md:col-span-2"}>
                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
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
                            <label className="mb-1 block text-sm text-gray-600">Повторите пароль</label>
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
                        <p className="sm:col-span-2 text-xs text-gray-500">
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
                    className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
                >
                    {submitting ? "Сохранение..." : submitLabel}
                </button>
            </div>
        </div>
    );
}

export type { UserFormState };

