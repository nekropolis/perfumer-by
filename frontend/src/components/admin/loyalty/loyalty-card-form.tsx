"use client";

import { adminBtnPrimary, adminCheckbox } from "@/lib/admin-ui-classes";

export type LoyaltyCardFormState = {
    id?: number;
    number: string;
    discount_percent: string;
    is_manual_discount: boolean;
    status: "active" | "blocked" | "expired";
};

export const LOYALTY_CARD_ACCUMULATION_MAX_PERCENT = 10;
export const LOYALTY_CARD_MANUAL_MAX_PERCENT = 20;

export function loyaltyCardDiscountMax(isManual: boolean): number {
    return isManual ? LOYALTY_CARD_MANUAL_MAX_PERCENT : LOYALTY_CARD_ACCUMULATION_MAX_PERCENT;
}

export function validateLoyaltyCardDiscountPercent(
    discountPercent: string,
    isManual: boolean,
): string | null {
    const value = Number(discountPercent);
    if (!Number.isFinite(value) || value < 0) {
        return "Укажите корректный процент скидки";
    }
    const max = loyaltyCardDiscountMax(isManual);
    if (value > max) {
        return isManual
            ? `При ручной установке скидка не должна превышать ${LOYALTY_CARD_MANUAL_MAX_PERCENT}%.`
            : `Процент скидки не должен превышать ${LOYALTY_CARD_ACCUMULATION_MAX_PERCENT}%.`;
    }
    return null;
}

type Props = {
    form: LoyaltyCardFormState;
    submitting?: boolean;
    onChangeAction: (value: LoyaltyCardFormState) => void;
    onSubmitAction: () => void;
};

export default function LoyaltyCardForm({ form, submitting = false, onChangeAction, onSubmitAction }: Props) {
    const maxPercent = loyaltyCardDiscountMax(form.is_manual_discount);
    const discountError = validateLoyaltyCardDiscountPercent(form.discount_percent, form.is_manual_discount);

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

                <label className="flex items-center gap-2 rounded-lg border border-admin-border bg-admin-muted px-3 py-2 text-sm font-medium text-admin-text">
                    <input
                        type="checkbox"
                        checked={Boolean(form.is_manual_discount)}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                is_manual_discount: e.target.checked,
                            })
                        }
                        className={adminCheckbox}
                    />
                    Ручная установка скидки
                </label>
                {form.is_manual_discount ? (
                    <p className="text-xs text-admin-text-secondary">
                        Накопление скидки по заказам для этой карты отключено. Максимум — {LOYALTY_CARD_MANUAL_MAX_PERCENT}%.
                    </p>
                ) : null}

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        {form.is_manual_discount
                            ? `Процент скидки (ручная установка, до ${LOYALTY_CARD_MANUAL_MAX_PERCENT}% включительно)`
                            : `Процент скидки (накопление до ${LOYALTY_CARD_ACCUMULATION_MAX_PERCENT}% включительно)`}
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={maxPercent}
                        step="0.01"
                        value={form.discount_percent}
                        onChange={(e) => onChangeAction({ ...form, discount_percent: e.target.value })}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        required
                    />
                    {discountError ? (
                        <p className="mt-1.5 text-xs text-red-600">{discountError}</p>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-admin-border pt-4 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting || Boolean(discountError)}
                    className={`${adminBtnPrimary} w-full sm:w-auto`}
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
