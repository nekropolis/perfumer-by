"use client";

import AdminBrandSelect from "@/components/admin/ui/admin-brand-select";
import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import { slugify } from "@/lib/slugify";
import type { ProductBrandOption } from "@/lib/admin-products-api";

export type ProductFormState = {
    id?: number;
    brand_id: string;
    name: string;
    slug: string;
    is_active: boolean;
    h1: string;
    short_description: string;
    description: string;
    seo_title: string;
    seo_description: string;
};

type Props = {
    form: ProductFormState;
    brands: ProductBrandOption[];
    submitting?: boolean;
    onChange: (value: ProductFormState) => void;
    onSubmit: () => void;
};

export default function ProductForm({
                                        form,
                                        brands,
                                        submitting = false,
                                        onChange,
                                        onSubmit,
                                    }: Props) {
    return (
        <div className="space-y-6 rounded-2xl border bg-white p-5">
            <div className="space-y-4">
                <AdminBrandSelect
                    value={form.brand_id}
                    brands={brands}
                    onChange={(value) => onChange({ ...form, brand_id: value })}
                />

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
                                h1: form.id ? form.h1 : nextName,
                                seo_title: form.id ? form.seo_title : nextName,
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
                        readOnly
                        className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-600"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
                        H1
                    </label>
                    <input
                        type="text"
                        value={form.h1}
                        onChange={(e) => onChange({ ...form, h1: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
                        Краткое описание
                    </label>
                    <textarea
                        value={form.short_description}
                        onChange={(e) =>
                            onChange({ ...form, short_description: e.target.value })
                        }
                        className="min-h-[90px] w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">
                        Описание
                    </label>
                    <AdminRichTextEditor
                        value={form.description}
                        onChange={(value) =>
                            onChange({ ...form, description: value })
                        }
                        placeholder="Введите описание товара"
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
