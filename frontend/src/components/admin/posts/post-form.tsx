"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

import Image from "next/image";
import { useRef, useState } from "react";
import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import type { AdminPostEditorTab } from "@/components/admin/posts/post-editor-tabs";
import { uploadAdminPostCoverImage, type AdminPostType } from "@/lib/admin-posts-api";

export type AdminPostFormState = {
    id?: number;
    is_active: boolean;
    title: string;
    slug: string;
    type: AdminPostType;
    cover_image: string;
    excerpt: string;
    content: string;
    seo_title: string;
    seo_description: string;
};

type Props = {
    form: AdminPostFormState;
    submitting?: boolean;
    activeTab?: AdminPostEditorTab;
    onChangeAction: (next: AdminPostFormState) => void;
    onSubmitAction: () => void;
};

export default function AdminPostForm({
    form,
    submitting = false,
    activeTab = "main",
    onChangeAction,
    onSubmitAction,
}: Props) {
    const [uploadingCover, setUploadingCover] = useState(false);
    const [coverError, setCoverError] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleUploadCover = async (file: File | null) => {
        if (!file) return;
        setUploadingCover(true);
        setCoverError("");
        try {
            const payload = await uploadAdminPostCoverImage(file);
            if (payload.url) {
                onChangeAction({ ...form, cover_image: payload.url });
            }
        } catch (e: unknown) {
            setCoverError(e instanceof Error ? e.message : "Ошибка загрузки картинки");
        } finally {
            setUploadingCover(false);
        }
    };

    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                {activeTab === "main" ? (
                    <>
                        <div className="md:col-span-2">
                            <label className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form.is_active)}
                                    onChange={(e) => onChangeAction({ ...form, is_active: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                Активна
                            </label>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Название</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={(e) => {
                                    const title = e.target.value;
                                    onChangeAction({
                                        ...form,
                                        title,
                                        seo_title: form.id ? form.seo_title : title,
                                    });
                                }}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Slug (URL)</label>
                            <input
                                type="text"
                                value={form.slug}
                                onChange={(e) => onChangeAction({ ...form, slug: e.target.value })}
                                placeholder="латиница-через-дефис; пусто — сгенерируется из названия"
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Тип</label>
                            <select
                                value={form.type}
                                onChange={(e) => onChangeAction({ ...form, type: e.target.value as AdminPostType })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            >
                                <option value="news">Новость</option>
                                <option value="article">Статья</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Краткое содержание</label>
                            <textarea
                                value={form.excerpt}
                                onChange={(e) => onChangeAction({ ...form, excerpt: e.target.value })}
                                className="min-h-[110px] w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Контент</label>
                            <AdminRichTextEditor
                                value={form.content}
                                onChangeAction={(value) => onChangeAction({ ...form, content: value })}
                                placeholder="Введите контент публикации"
                                imageUploadUrl="/admin/posts/content-images"
                            />
                        </div>
                    </>
                ) : null}

                {activeTab === "seo" ? (
                    <>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO title</label>
                            <input
                                type="text"
                                value={form.seo_title}
                                onChange={(e) => onChangeAction({ ...form, seo_title: e.target.value })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO description</label>
                            <textarea
                                value={form.seo_description}
                                onChange={(e) => onChangeAction({ ...form, seo_description: e.target.value })}
                                className="min-h-[110px] w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>
                    </>
                ) : null}

                {activeTab === "image" ? (
                    <div className="md:col-span-2 space-y-4">
                        <div className="rounded-2xl border border-dashed p-4">
                            <div className="mb-2 text-sm text-admin-text">Загрузить одну картинку</div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingCover}
                                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {uploadingCover ? "Загружаем..." : "Выбрать файл"}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                    void handleUploadCover(event.target.files?.[0] ?? null);
                                    event.currentTarget.value = "";
                                }}
                            />
                            {coverError ? (
                                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {coverError}
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border bg-admin-muted p-3">
                            {form.cover_image ? (
                                <div className="relative h-40 w-40 overflow-hidden rounded-xl border bg-white sm:h-44 sm:w-44">
                                    <Image
                                        src={form.cover_image}
                                        alt="Обложка публикации"
                                        fill
                                        className="object-cover"
                                        unoptimized={form.cover_image.startsWith("http://") || form.cover_image.startsWith("https://")}
                                    />
                                </div>
                            ) : (
                                <div className="rounded-xl border border-admin-border bg-white px-3 py-6 text-sm text-admin-text-secondary">
                                    Картинка не выбрана
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
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
