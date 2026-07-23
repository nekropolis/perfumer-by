"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

export type LoyaltyCardFormState = {
    id?: number;
    number: string;
    discount_percent: string;
    status: "active" | "blocked" | "expired";
};

type Props = {
    form: LoyaltyCardFormState;
    submitting?: boolean;
    onChangeAction: (value: LoyaltyCardFormState) => void;
    onSubmitAction: () => void;
};

export default function LoyaltyCardForm({ form, submitting = false, onChangeAction, onSubmitAction }: Props) {
    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5">
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Статус карты</label>
                    <select
                        value={form.status}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                status: e.target.value as LoyaltyCardFormState["status"],
                            })
                        }
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    >
                        <option value="active">Активна</option>
                        <option value="blocked">Заблокирована</option>
                        <option value="expired">Истекла</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Номер карты</label>
                    <input
                        type="text"
                        value={form.number}
                        readOnly={!!form.id}
                        onChange={(e) => onChangeAction({ ...form, number: e.target.value })}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15 disabled:bg-admin-muted"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Процент скидки (накопление до 10% включительно)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={10}
                        step="0.01"
                        value={form.discount_percent}
                        onChange={(e) => onChangeAction({ ...form, discount_percent: e.target.value })}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        required
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
