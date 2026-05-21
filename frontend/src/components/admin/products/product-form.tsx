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
    is_new: boolean;
    is_hit: boolean;
    h1: string;
    short_description: string;
    description: string;
    seo_title: string;
    seo_description: string;
    seo_keyword: string;
};

type Props = {
    form: ProductFormState;
    brands: ProductBrandOption[];
    submitting?: boolean;
    onChangeAction: (value: ProductFormState) => void;
    onSubmitAction: () => void;
    /** Legacy (импорт): уникализация описания недоступна */
    isLegacyForImport?: boolean;
    /** Открытые задачи import_retry_queue для карточки */
    importRetryPendingTasks?: string[];
    descriptionRewrittenAt?: string | null;
    descriptionRewriting?: boolean;
    onRewriteDescriptionAction?: () => void | Promise<void>;
};

export default function ProductForm({
                                        form,
                                        brands,
                                        submitting = false,
                                        onChangeAction,
                                        onSubmitAction,
                                        isLegacyForImport = false,
                                        importRetryPendingTasks = [],
                                        descriptionRewrittenAt = null,
                                        descriptionRewriting = false,
                                        onRewriteDescriptionAction,
                                    }: Props) {
    const pendingLabel = importRetryPendingTasks.length
        ? importRetryPendingTasks.join(", ")
        : "";

    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            {importRetryPendingTasks.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    <span className="font-medium">Импорт:</span> есть невыполненные задачи (
                    <span className="font-mono text-xs">{pendingLabel}</span>
                    ).
                </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-muted px-3 py-2 text-xs font-medium text-admin-text">
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
                    <label className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-muted px-3 py-2 text-xs font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_new)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    is_new: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Новинка
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-muted px-3 py-2 text-xs font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_hit)}
                            onChange={(e) =>
                                onChangeAction({
                                    ...form,
                                    is_hit: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        Хит
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
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
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
                        className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Slug
                    </label>
                    <input
                        type="text"
                        value={form.slug}
                        readOnly
                        className="w-full rounded-xl border border-admin-border bg-admin-muted px-4 py-2.5 text-sm text-admin-text-secondary outline-none"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        H1
                    </label>
                    <input
                        type="text"
                        value={form.h1}
                        onChange={(e) => onChangeAction({ ...form, h1: e.target.value })}
                        className="w-full rounded-xl border border-admin-border px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">
                        Краткое описание
                    </label>
                    <textarea
                        value={form.short_description}
                        onChange={(e) =>
                            onChangeAction({ ...form, short_description: e.target.value })
                        }
                        className="min-h-[110px] w-full rounded-xl border border-admin-border px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div className="md:col-span-2">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-sm font-medium text-admin-text">
                            Описание
                            {descriptionRewrittenAt ? (
                                <span className="ml-2 font-normal text-xs text-admin-text-secondary">
                                    (уникализировано: {new Date(descriptionRewrittenAt).toLocaleString()})
                                </span>
                            ) : null}
                        </label>
                        {form.id ? (
                            <button
                                type="button"
                                onClick={() => void onRewriteDescriptionAction?.()}
                                disabled={
                                    descriptionRewriting || Boolean(isLegacyForImport) || !onRewriteDescriptionAction
                                }
                                title={
                                    isLegacyForImport
                                        ? "Legacy-товар — уникализация недоступна"
                                        : "Переписать описание через LLM и сохранить в карточку"
                                }
                                className="rounded-lg border bg-white px-3 py-1.5 text-xs disabled:opacity-50"
                            >
                                {descriptionRewriting ? "LLM…" : "Уникализировать описание"}
                            </button>
                        ) : null}
                    </div>
                    {isLegacyForImport ? (
                        <div className="mb-2 text-xs text-admin-text-secondary">
                            Товар помечен как legacy — описание через LLM не меняется.
                        </div>
                    ) : null}
                    <AdminRichTextEditor
                        value={form.description}
                        onChangeAction={(value) => onChangeAction({ ...form, description: value })}
                        placeholder="Введите описание товара"
                    />
                </div>
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
