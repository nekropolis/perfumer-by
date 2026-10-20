"use client";

import { useEffect, useState } from "react";
import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import { adminBtnPrimary, adminCheckbox } from "@/lib/admin-ui-classes";
import { fetchAttributeById, fetchAttributes, type AttributeAdminItem } from "@/lib/admin-attributes-api";
import { slugify } from "@/lib/slugify";
import type { AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";

export type AdminCatalogLandingFormState = {
    id?: number;
    is_active: boolean;
    slug: string;
    gender: "" | "female" | "male" | "unisex";
    h1: string;
    content: string;
    seo_title: string;
    seo_description: string;
    sort: number;
    filtersJson: string;
};

type Props = {
    form: AdminCatalogLandingFormState;
    submitting?: boolean;
    activeTab?: AdminPageEditorTab;
    onChangeAction: (next: AdminCatalogLandingFormState) => void;
    onSubmitAction: () => void;
};

export function filtersRecordToJson(filters?: Record<string, number[]> | null): string {
    if (!filters || Object.keys(filters).length === 0) {
        return "{}";
    }
    return JSON.stringify(filters, null, 2);
}

export function parseFiltersJson(raw: string): Record<string, number[]> {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "{}") {
        return {};
    }
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Фильтры должны быть JSON-объектом");
    }
    const result: Record<string, number[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!/^\d+$/.test(key)) {
            throw new Error(`Некорректный ID атрибута: ${key}`);
        }
        if (!Array.isArray(value)) {
            throw new Error(`Значения для attr ${key} должны быть массивом ID опций`);
        }
        const ids = value.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length > 0) {
            result[key] = ids;
        }
    }
    return result;
}

export default function AdminCatalogLandingForm({
    form,
    submitting = false,
    activeTab = "main",
    onChangeAction,
    onSubmitAction,
}: Props) {
    const [attributes, setAttributes] = useState<AttributeAdminItem[]>([]);
    const [filterHint, setFilterHint] = useState("");

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetchAttributes({ page: 1 });
                setAttributes((res.data || []).filter((item) => item.is_filterable));
            } catch {
                setAttributes([]);
            }
        })();
    }, []);

    const appendFilterExample = async (attributeId: number) => {
        try {
            const detail = await fetchAttributeById(attributeId);
            const firstOption = detail.data.options?.[0];
            if (!firstOption) {
                setFilterHint("У атрибута нет опций для примера");
                return;
            }
            let current: Record<string, number[]> = {};
            try {
                current = parseFiltersJson(form.filtersJson);
            } catch {
                current = {};
            }
            current[String(attributeId)] = [firstOption.id];
            onChangeAction({ ...form, filtersJson: JSON.stringify(current, null, 2) });
            setFilterHint("");
        } catch (e: unknown) {
            setFilterHint(e instanceof Error ? e.message : "Не удалось добавить фильтр");
        }
    };

    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                    <label className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                        <input
                            type="checkbox"
                            checked={Boolean(form.is_active)}
                            onChange={(e) => onChangeAction({ ...form, is_active: e.target.checked })}
                            className={adminCheckbox}
                        />
                        Активна
                    </label>
                </div>

                {activeTab === "main" ? (
                    <>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">H1</label>
                            <input
                                type="text"
                                value={form.h1}
                                onChange={(e) => {
                                    const h1 = e.target.value;
                                    onChangeAction({
                                        ...form,
                                        h1,
                                        slug: form.id ? form.slug : slugify(h1),
                                        seo_title: form.id ? form.seo_title : h1,
                                    });
                                }}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Slug (URL: /catalog/…)</label>
                            <input
                                type="text"
                                value={form.slug}
                                readOnly={Boolean(form.id)}
                                onChange={(e) => onChangeAction({ ...form, slug: e.target.value })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-muted px-3 py-2 text-sm text-admin-text outline-none"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Пол (gender=)</label>
                            <select
                                value={form.gender}
                                onChange={(e) =>
                                    onChangeAction({
                                        ...form,
                                        gender: e.target.value as AdminCatalogLandingFormState["gender"],
                                    })
                                }
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none"
                            >
                                <option value="">—</option>
                                <option value="female">Женские</option>
                                <option value="male">Мужские</option>
                                <option value="unisex">Унисекс</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Сортировка</label>
                            <input
                                type="number"
                                min={0}
                                value={form.sort}
                                onChange={(e) => onChangeAction({ ...form, sort: Number(e.target.value) || 0 })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">
                                Фильтры (attr_id → [option_id, …])
                            </label>
                            {attributes.length > 0 ? (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {attributes.slice(0, 12).map((attr) => (
                                        <button
                                            key={attr.id}
                                            type="button"
                                            onClick={() => void appendFilterExample(attr.id)}
                                            className="rounded-md border border-admin-border px-2 py-1 text-xs text-admin-text-secondary transition hover:bg-admin-muted"
                                        >
                                            + {attr.name}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <textarea
                                value={form.filtersJson}
                                onChange={(e) => onChangeAction({ ...form, filtersJson: e.target.value })}
                                rows={6}
                                spellCheck={false}
                                className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 font-mono text-xs text-admin-text outline-none focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                                placeholder='{"18": [699]}'
                            />
                            {filterHint ? <p className="mt-1 text-xs text-amber-700">{filterHint}</p> : null}
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">Текст под листингом</label>
                            <AdminRichTextEditor
                                value={form.content}
                                onChangeAction={(value) => onChangeAction({ ...form, content: value })}
                                placeholder="SEO-текст посадочной"
                                imageUploadUrl="/admin/pages/content-images"
                            />
                        </div>
                    </>
                ) : null}

                {activeTab === "seo" ? (
                    <>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO title</label>
                            <input
                                type="text"
                                value={form.seo_title}
                                onChange={(e) => onChangeAction({ ...form, seo_title: e.target.value })}
                                className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-medium text-admin-text">SEO description</label>
                            <textarea
                                value={form.seo_description}
                                onChange={(e) => onChangeAction({ ...form, seo_description: e.target.value })}
                                rows={4}
                                className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none"
                            />
                        </div>
                    </>
                ) : null}
            </div>

            <div className="flex justify-end border-t border-admin-border pt-4">
                <button
                    type="button"
                    disabled={submitting}
                    onClick={onSubmitAction}
                    className={adminBtnPrimary}
                >
                    {submitting ? "Сохранение…" : "Сохранить"}
                </button>
            </div>
        </div>
    );
}
