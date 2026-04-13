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
        <div className="space-y-6 rounded-2xl border bg-white p-5">
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm text-gray-600">
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
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
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
                        className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-600"
                        required
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
                    Активен
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
