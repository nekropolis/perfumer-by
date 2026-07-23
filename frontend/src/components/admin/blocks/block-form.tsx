"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

import AdminRichTextEditor from "@/components/admin/ui/admin-rich-text-editor";
import { slugify } from "@/lib/slugify";

export type AdminBlockFormState = {
    id?: number;
    is_active: boolean;
    name: string;
    code: string;
    content: string;
};

type Props = {
    form: AdminBlockFormState;
    submitting?: boolean;
    onChangeAction: (next: AdminBlockFormState) => void;
    onSubmitAction: () => void;
};

export default function AdminBlockForm({
    form,
    submitting = false,
    onChangeAction,
    onSubmitAction,
}: Props) {
    return (
        <div className="space-y-6 rounded-xl border border-admin-border bg-admin-surface p-5 shadow-admin-card sm:p-6">
            <div className="grid gap-5">
                <label className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted px-4 py-3 text-sm font-medium text-admin-text">
                    <input
                        type="checkbox"
                        checked={Boolean(form.is_active)}
                        onChange={(e) => onChangeAction({ ...form, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                    Активен
                </label>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Название</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => {
                            const name = e.target.value;
                            onChangeAction({
                                ...form,
                                name,
                                code: form.id ? form.code : slugify(name),
                            });
                        }}
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Код</label>
                    <input
                        type="text"
                        value={form.code}
                        readOnly
                        className="w-full min-h-10 rounded-lg border border-admin-border bg-admin-muted px-3 py-2 text-sm text-admin-text-secondary outline-none"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-admin-text">Содержание</label>
                    <AdminRichTextEditor
                        value={form.content}
                        onChangeAction={(value) => onChangeAction({ ...form, content: value })}
                        placeholder="Введите контент блока"
                        imageUploadUrl="/admin/blocks/content-images"
                    />
                </div>
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
