"use client";

import type { AttributeType } from "@/lib/admin-attributes-api";

export type AttributeFormState = {
    id?: number;
    name: string;
    type: AttributeType;
    sort_order: string;
    is_active: boolean;
    is_filterable: boolean;
    filter_sort_order: string;
};

type Props = {
    form: AttributeFormState;
    submitting?: boolean;
    onChangeAction: (value: AttributeFormState) => void;
    onSubmitAction: () => void;
};

export default function AttributeForm({
                                          form,
                                          submitting = false,
                                          onChangeAction,
                                          onSubmitAction,
                                      }: Props) {
    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_active)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    is_active: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Активен
                    </label>

                    <label className="flex items-center gap-3 rounded-2xl border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_filterable)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    is_filterable: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Участвует в фильтре каталога
                    </label>
                </div>

                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Название
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                name: e.target.value,
                            })
                        }
                        className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Тип
                    </label>
                    <select
                        value={form.type}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                type: e.target.value as AttributeType,
                            })
                        }
                        className="w-full rounded-xl border border-admin-border bg-white px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    >
                        <option value="text">Текст</option>
                        <option value="select">Один из списка</option>
                        <option value="multiselect">Несколько из списка</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Порядок сортировки
                    </label>
                    <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                sort_order: e.target.value,
                            })
                        }
                        className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Порядок в фильтрах
                    </label>
                    <input
                        type="number"
                        value={form.filter_sort_order}
                        onChange={(e) =>
                            onChangeAction({
                                ...form,
                                filter_sort_order: e.target.value,
                            })
                        }
                        className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        disabled={!form.is_filterable}
                    />
                </div>
            </div>

            <div className="flex justify-end border-t border-admin-border pt-4">
                <button
                    type="button"
                    onClick={onSubmitAction}
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-full bg-admin-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
