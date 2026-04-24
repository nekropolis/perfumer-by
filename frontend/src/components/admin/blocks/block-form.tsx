"use client";

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
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5">
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                    <input
                        type="checkbox"
                        checked={Boolean(form.is_active)}
                        onChange={(e) => onChangeAction({ ...form, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                    Активен
                </label>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Название</label>
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
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Код</label>
                    <input
                        type="text"
                        value={form.code}
                        readOnly
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 outline-none"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Содержание</label>
                    <AdminRichTextEditor
                        value={form.content}
                        onChangeAction={(value) => onChangeAction({ ...form, content: value })}
                        placeholder="Введите контент блока"
                        imageUploadUrl="/admin/blocks/content-images"
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
