"use client";

import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import { slugify } from "@/lib/slugify";
import type { AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";

export type AdminPageFormState = {
    id?: number;
    is_active: boolean;
    name: string;
    slug: string;
    h1: string;
    content: string;
    seo_title: string;
    seo_description: string;
};

type Props = {
    form: AdminPageFormState;
    submitting?: boolean;
    activeTab?: AdminPageEditorTab;
    onChangeAction: (next: AdminPageFormState) => void;
    onSubmitAction: () => void;
};

export default function AdminPageForm({
    form,
    submitting = false,
    activeTab = "main",
    onChangeAction,
    onSubmitAction,
}: Props) {
    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_active)}
                            onChange={(e) => onChangeAction({ ...form, is_active: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Активна
                    </label>
                </div>

                {activeTab === "main" ? (
                    <>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Название</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => {
                                    const name = e.target.value;
                                    onChangeAction({
                                        ...form,
                                        name,
                                        slug: form.id ? form.slug : slugify(name),
                                        h1: form.id ? form.h1 : name,
                                        seo_title: form.id ? form.seo_title : name,
                                    });
                                }}
                                className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Slug</label>
                            <input
                                type="text"
                                value={form.slug}
                                readOnly
                                className="w-full rounded-xl border border-admin-border bg-admin-muted px-4 py-2.5 text-sm text-admin-text-secondary outline-none"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">H1</label>
                            <input
                                type="text"
                                value={form.h1}
                                onChange={(e) => onChangeAction({ ...form, h1: e.target.value })}
                                className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Содержание</label>
                            <AdminRichTextEditor
                                value={form.content}
                                onChangeAction={(value) => onChangeAction({ ...form, content: value })}
                                placeholder="Введите контент страницы"
                                imageUploadUrl="/admin/pages/content-images"
                            />
                        </div>
                    </>
                ) : null}

                {activeTab === "seo" ? (
                    <>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Название</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => onChangeAction({ ...form, name: e.target.value })}
                                className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Slug</label>
                            <input
                                type="text"
                                value={form.slug}
                                readOnly
                                className="w-full rounded-xl border border-admin-border bg-admin-muted px-4 py-2.5 text-sm text-admin-text-secondary outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO title</label>
                            <input
                                type="text"
                                value={form.seo_title}
                                onChange={(e) => onChangeAction({ ...form, seo_title: e.target.value })}
                                className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO description</label>
                            <textarea
                                value={form.seo_description}
                                onChange={(e) => onChangeAction({ ...form, seo_description: e.target.value })}
                                className="min-h-[110px] w-full rounded-xl border border-admin-border px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                            />
                        </div>
                    </>
                ) : null}
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
