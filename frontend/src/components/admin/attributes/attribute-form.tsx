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
        <div className="space-y-6 rounded-2xl border bg-white p-5">
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm text-gray-600">
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
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
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
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    >
                        <option value="text">Текст</option>
                        <option value="select">Один из списка</option>
                        <option value="multiselect">Несколько из списка</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
                        Sort order
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
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) =>
                            onChange({
                                ...form,
                                is_active: e.target.checked,
                            })
                        }
                    />
                    Активна
                </label>
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                    {submitting ? "Сохранение..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
