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
    is_stock_product: boolean;
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
    onChangeAction: (value: ProductFormState) => void;
    onSubmitAction: () => void;
};

export default function ProductForm({
                                        form,
                                        brands,
                                        submitting = false,
                                        onChangeAction,
                                        onSubmitAction,
                                    }: Props) {
    return (
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
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

                    <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_stock_product)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    is_stock_product: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Товар склада (остаток влияет на наличие)
                    </label>
                </div>

                <div className="md:col-span-2">
                    <AdminBrandSelect
                        value={form.brand_id}
                        brands={brands}
                        onChangeAction={(value) => onChangeAction({ ...form, brand_id: value })}
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Название
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => {
                            const nextName = e.target.value;

                            onChangeAction({
                                ...form,
                                name: nextName,
                                slug: form.id ? form.slug : slugify(nextName),
                                h1: form.id ? form.h1 : nextName,
                                seo_title: form.id ? form.seo_title : nextName,
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
                        readOnly
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 outline-none"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        H1
                    </label>
                    <input
                        type="text"
                        value={form.h1}
                        onChange={(e) => onChangeAction({ ...form, h1: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Краткое описание
                    </label>
                    <textarea
                        value={form.short_description}
                        onChange={(e) =>
                            onChangeAction({ ...form, short_description: e.target.value })
                        }
                        className="min-h-[110px] w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Описание
                    </label>
                    <AdminRichTextEditor
                        value={form.description}
                        onChangeAction={(value) => onChangeAction({ ...form, description: value })}
                        placeholder="Введите описание товара"
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
