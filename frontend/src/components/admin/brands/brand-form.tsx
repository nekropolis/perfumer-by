"use client";

import { slugify } from "@/lib/slugify";

export type BrandFormState = {
    id?: number;
    name: string;
    slug: string;
    is_active: boolean;
};

type Props = {
    form: BrandFormState;
    submitting?: boolean;
    onChange: (value: BrandFormState) => void;
    onSubmit: () => void;
};

export default function BrandForm({
                                      form,
                                      submitting = false,
                                      onChange,
                                      onSubmit,
                                  }: Props) {
    return (
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5">
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Название
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => {
                            const nextName = e.target.value;

                            onChange({
                                ...form,
                                name: nextName,
                                slug: form.id ? form.slug : slugify(nextName),
                            });
                        }}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Slug
                    </label>
                    <input
                        type="text"
                        value={form.slug}
                        readOnly={!!form.id}
                        onChange={(e) => {
                            const slug = e.target.value;

                            onChange({
                                ...form,
                                slug: form.id ? form.slug : slugify(slug),
                            });
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 outline-none"
                        required
                    />
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
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
                    Активен
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
