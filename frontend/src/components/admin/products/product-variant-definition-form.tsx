"use client";

export type ProductVariantDefinitionFormState = {
    id?: number;
    title?: string;
    volume_ml: string;
    concentration_code: string;
    concentration_label: string;
    is_tester: boolean;
    excludes_from_free_delivery_threshold: boolean;
};

type Props = {
    form: ProductVariantDefinitionFormState;
    submitting?: boolean;
    onChangeAction: (next: ProductVariantDefinitionFormState) => void;
    onSubmitAction: () => void;
};

export default function ProductVariantDefinitionForm({
    form,
    submitting = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    return (
        <div className="rounded-2xl border border-admin-border bg-white p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1.5 block text-sm text-admin-text-secondary">Объем (мл)</label>
                    <input
                        type="number"
                        value={form.volume_ml}
                        onChange={(e) => onChangeAction({ ...form, volume_ml: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-sm text-admin-text-secondary">Код концентрации</label>
                    <input
                        type="text"
                        value={form.concentration_code}
                        onChange={(e) => onChangeAction({ ...form, concentration_code: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="edt / edp / extrait de parfum"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm text-admin-text-secondary">Описание концентрации</label>
                    <input
                        type="text"
                        value={form.concentration_label}
                        onChange={(e) => onChangeAction({ ...form, concentration_label: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="Например: Парфюмерная вода"
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
                    <input
                        type="checkbox"
                        checked={form.is_tester}
                        onChange={(e) => onChangeAction({ ...form, is_tester: e.target.checked })}
                    />
                    <span>Тестер</span>
                </label>

                <label className="inline-flex max-w-xl items-start gap-2 text-sm text-admin-text md:col-span-2">
                    <input
                        type="checkbox"
                        checked={form.excludes_from_free_delivery_threshold}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                excludes_from_free_delivery_threshold: e.target.checked,
                            })
                        }
                        className="mt-0.5"
                    />
                    <span>
                        Не учитывать в «2 наименования» для бесплатной доставки по РБ (платная позиция / мелкий
                        товар) — для всех товаров с этим вариантом справочника
                    </span>
                </label>
            </div>

            <div className="mt-5 flex justify-end">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
