"use client";

import type { AttributeType } from "@/lib/admin-attributes-api";

export type AttributeFormState = {
    id?: number;
    name: string;
    type: AttributeType;
    sort_order: string;
    is_active: boolean;
};

type Props = {
    form: AttributeFormState;
    submitting?: boolean;
    onChange: (value: AttributeFormState) => void;
    onSubmit: () => void;
};

export default function AttributeForm({
                                          form,
                                          submitting = false,
                                          onChange,
                                          onSubmit,
                                      }: Props) {
    return (
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Название
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                            onChange({
                                ...form,
                                name: e.target.value,
                            })
                        }
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Тип
                    </label>
                    <select
                        value={form.type}
                        onChange={(e) =>
                            onChange({
                                ...form,
                                type: e.target.value as AttributeType,
                            })
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    >
                        <option value="text">Текст</option>
                        <option value="select">Один из списка</option>
                        <option value="multiselect">Несколько из списка</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Порядок сортировки
                    </label>
                    <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) =>
                            onChange({
                                ...form,
                                sort_order: e.target.value,
                            })
                        }
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                    <input
                        type="checkbox"
                        checked={Boolean(form.is_active)}
                        onChange={(e) =>
                            onChange({
                                ...form,
                                is_active: e.target.checked,
                            })
                        }
                        className="h-4 w-4 rounded border-gray-300"
                    />
                    Активна
                </label>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-4">
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
