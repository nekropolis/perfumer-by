"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

export type GiftCertificateFormState = {
    id?: number;
    code: string;
    template_id?: string;
    initial_amount: string;
    balance_amount: string;
    reserved_amount?: string;
    status: string;
    source?: string;
    expires_at: string;
    issued_to_user_id?: string;
    issued_phone?: string;
    comment?: string;
};

type Props = {
    form: GiftCertificateFormState;
    templateOptions?: { id: number; title: string; amount: string; is_active: boolean }[];
    submitting?: boolean;
    onChangeAction: (value: GiftCertificateFormState) => void;
    onSubmitAction: () => void;
};

export default function GiftCertificateForm({
    form,
    templateOptions = [],
    submitting = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    const isCreate = !form.id;

    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5">
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Код сертификата</label>
                    <input
                        type="text"
                        value={form.code}
                        maxLength={64}
                        onChange={(e) => onChangeAction({ ...form, code: e.target.value })}
                        placeholder="Введите код сертификата"
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    />
                </div>

                {isCreate ? (
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">Шаблон номинала</label>
                        <select
                            value={form.template_id ?? ""}
                            onChange={(e) => {
                                const value = e.target.value;
                                const selected = templateOptions.find((t) => String(t.id) === value);
                                onChangeAction({
                                    ...form,
                                    template_id: value,
                                    initial_amount: selected?.amount ? String(selected.amount) : form.initial_amount,
                                    balance_amount: selected?.amount ? String(selected.amount) : form.balance_amount,
                                });
                            }}
                            className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        >
                            <option value="">Не выбран (ввести номинал вручную)</option>
                            {templateOptions
                                .filter((t) => t.is_active)
                                .map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.title}
                                    </option>
                                ))}
                        </select>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">Номинал (начальный баланс)</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.initial_amount}
                            readOnly={!isCreate}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    initial_amount: e.target.value,
                                    ...(isCreate ? { balance_amount: e.target.value } : {}),
                                })
                            }
                            className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15 disabled:bg-admin-muted"
                            required={isCreate}
                        />
                    </div>

                    {!isCreate ? (
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Баланс</label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.balance_amount}
                                onChange={(e) => onChangeAction({ ...form, balance_amount: e.target.value })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                                required
                            />
                        </div>
                    ) : null}
                </div>

                {!isCreate && form.reserved_amount !== undefined ? (
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">В резерве (только чтение)</label>
                        <input
                            type="text"
                            readOnly
                            value={form.reserved_amount}
                            className="w-full rounded-lg border border-admin-border bg-admin-muted px-4 py-2.5 text-sm text-admin-text-secondary"
                        />
                    </div>
                ) : null}

                {!isCreate ? (
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">Статус</label>
                        <select
                            value={form.status}
                            onChange={(e) => onChangeAction({ ...form, status: e.target.value })}
                            className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        >
                            <option value="new">Ожидает код</option>
                            <option value="active">Активен</option>
                            <option value="used">Использован</option>
                            <option value="redeemed">Погашен</option>
                            <option value="void">Аннулирован</option>
                            <option value="expired">Истёк</option>
                        </select>
                    </div>
                ) : null}

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Причина/источник выдачи</label>
                    <input
                        type="text"
                        value={form.source ?? "manual"}
                        onChange={(e) => onChangeAction({ ...form, source: e.target.value })}
                        placeholder="manual / sold / promo / compensation"
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    />
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">ID клиента (кому выдан)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={form.issued_to_user_id ?? ""}
                            onChange={(e) => onChangeAction({ ...form, issued_to_user_id: e.target.value })}
                            placeholder="Опционально"
                            className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text">Телефон получателя</label>
                        <input
                            type="text"
                            value={form.issued_phone ?? ""}
                            onChange={(e) => onChangeAction({ ...form, issued_phone: e.target.value })}
                            placeholder="+375..."
                            className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Срок действия (опционально)</label>
                    <input
                        type="datetime-local"
                        value={form.expires_at}
                        onChange={(e) => onChangeAction({ ...form, expires_at: e.target.value })}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Комментарий</label>
                    <textarea
                        value={form.comment ?? ""}
                        onChange={(e) => onChangeAction({ ...form, comment: e.target.value })}
                        rows={3}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    />
                </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-admin-border pt-4 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className={`${adminBtnPrimary} w-full sm:w-auto`}
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
