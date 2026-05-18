"use client";

import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import { slugify } from "@/lib/slugify";

export type BrandFormState = {
    id?: number;
    name: string;
    slug: string;
    description: string;
    seo_title: string;
    seo_description: string;
    seo_keyword: string;
    is_active: boolean;
};

type Props = {
    form: BrandFormState;
    activeTab: "main" | "seo";
    submitting?: boolean;
    onChangeAction: (value: BrandFormState) => void;
    onSubmitAction: () => void;
};

export default function BrandForm({
    form,
    activeTab,
    submitting = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    return (
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            {activeTab === "main" ? (
                <div className="grid gap-5">
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

                    <div>
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
                            readOnly={!!form.id}
                            onChange={(e) => {
                                const slug = e.target.value;

                                onChangeAction({
                                    ...form,
                                    slug: form.id ? form.slug : slugify(slug),
                                });
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                            Описание
                        </label>
                        <AdminRichTextEditor
                            value={form.description}
                            onChangeAction={(value) =>
                                onChangeAction({ ...form, description: value })
                            }
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
                            SEO title
                        </label>
                        <input
                            type="text"
                            value={form.seo_title}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    seo_title: e.target.value,
                                })
                            }
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
                            SEO description
                        </label>
                        <textarea
                            value={form.seo_description}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    seo_description: e.target.value,
                                })
                            }
                            className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
                            SEO keyword
                        </label>
                        <textarea
                            value={form.seo_keyword}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    seo_keyword: e.target.value,
                                })
                            }
                            className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>
                </div>
            )}

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
