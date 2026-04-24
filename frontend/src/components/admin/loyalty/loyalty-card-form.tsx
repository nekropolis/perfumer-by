"use client";

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
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5">
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Статус карты</label>
                    <select
                        value={form.status}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                status: e.target.value as LoyaltyCardFormState["status"],
                            })
                        }
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    >
                        <option value="active">Активна</option>
                        <option value="blocked">Заблокирована</option>
                        <option value="expired">Истекла</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Номер карты</label>
                    <input
                        type="text"
                        value={form.number}
                        readOnly={!!form.id}
                        onChange={(e) => onChangeAction({ ...form, number: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Процент скидки (накопление до 10% включительно)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={10}
                        step="0.01"
                        value={form.discount_percent}
                        onChange={(e) => onChangeAction({ ...form, discount_percent: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        required
                    />
                </div>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-4">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
