"use client";

export type ProductVariantDefinitionFormState = {
    id?: number;
    title?: string;
    volume_ml: string;
    concentration_code: string;
    concentration_label: string;
    is_tester: boolean;
    is_vial: boolean;
    is_miniature: boolean;
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
                        type="text"
                        inputMode="decimal"
                        value={form.volume_ml}
                        onChange={(e) => onChangeAction({ ...form, volume_ml: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="1,3 или 100 (шаг 0,1)"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-sm text-admin-text-secondary">Код концентрации</label>
                    <input
                        type="text"
                        value={form.concentration_code}
                        onChange={(e) => onChangeAction({ ...form, concentration_code: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="edt / edp / extrait de parfum"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm text-admin-text-secondary">Описание концентрации</label>
                    <input
                        type="text"
                        value={form.concentration_label}
                        onChange={(e) => onChangeAction({ ...form, concentration_label: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Например: Парфюмерная вода"
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
                    <input
                        type="checkbox"
                        checked={form.is_tester}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                is_tester: e.target.checked,
                                is_vial: e.target.checked ? false : form.is_vial,
                                is_miniature: e.target.checked ? false : form.is_miniature,
                            })
                        }
                    />
                    <span>Тестер</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
                    <input
                        type="checkbox"
                        checked={form.is_vial}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                is_vial: e.target.checked,
                                is_tester: e.target.checked ? false : form.is_tester,
                                is_miniature: e.target.checked ? false : form.is_miniature,
                            })
                        }
                    />
                    <span>Пробник</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
                    <input
                        type="checkbox"
                        checked={form.is_miniature}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                is_miniature: e.target.checked,
                                is_vial: e.target.checked ? false : form.is_vial,
                            })
                        }
                    />
                    <span>Миниатюра</span>
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
                    className="rounded-lg bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
