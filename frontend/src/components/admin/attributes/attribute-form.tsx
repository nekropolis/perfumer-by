"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

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
                    <label className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
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

                    <label className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
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
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
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
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
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
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
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
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                        disabled={!form.is_filterable}
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
