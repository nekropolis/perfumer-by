"use client";

import { useState } from "react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import {
    createAttributeOption,
    deleteAttributeOption,
    updateAttributeOption,
    type AttributeOptionAdminItem,
} from "@/lib/admin-attributes-api";

type OptionFormState = {
    id?: number;
    name: string;
    sort_order: string;
    is_active: boolean;
};

type Props = {
    attributeId: number;
    items: AttributeOptionAdminItem[];
    disabled?: boolean;
    onReload: () => Promise<void>;
};

const emptyForm: OptionFormState = {
    name: "",
    sort_order: "0",
    is_active: true,
};
export default function AttributeOptionsEditor({
                                                   attributeId,
                                                   items,
                                                   disabled = false,
                                                   onReload,
                                               }: Props) {
    const [form, setForm] = useState<OptionFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AttributeOptionAdminItem | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const resetForm = () => {
        setForm(emptyForm);
    };

    const startEdit = (item: AttributeOptionAdminItem) => {
        setForm({
            id: item.id,
            name: item.name,
            sort_order: String(item.sort_order ?? 0),
            is_active: item.is_active,
        });

        setError("");
        setSuccess("");
    };

    const handleSubmit = async () => {
        if (disabled) {
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!form.name.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            const payload = {
                name: form.name,
                sort_order: Number(form.sort_order || 0),
                is_active: form.is_active,
            };

            const result = form.id
                ? await updateAttributeOption(attributeId, form.id, payload)
                : await createAttributeOption(attributeId, payload);

            setSuccess(result.message || "Опция сохранена");
            resetForm();
            await onReload();
        } catch (e: any) {
            setError(e?.message || "Ошибка сохранения опции");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            const result = await deleteAttributeOption(attributeId, deleteTarget.id);
            setSuccess(result.message || "Опция удалена");
            setDeleteTarget(null);
            await onReload();
        } catch (e: any) {
            setError(e?.message || "Ошибка удаления опции");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {disabled ? (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                    Для текстовой характеристики список опций не используется.
                </div>
            ) : null}

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {success ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {success}
                </div>
            ) : null}

            <div className="space-y-4 rounded-2xl border bg-white p-5">
                <div className="text-base font-semibold">
                    {form.id ? "Редактировать опцию" : "Добавить опцию"}
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
                            Название
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            disabled={disabled}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    name: e.target.value,
                                })
                            }
                            className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-gray-50"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-gray-600">
                            Sort order
                        </label>
                        <input
                            type="number"
                            value={form.sort_order}
                            disabled={disabled}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    sort_order: e.target.value,
                                })
                            }
                            className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-gray-50"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            disabled={disabled}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    is_active: e.target.checked,
                                })
                            }
                        />
                        Активна
                    </label>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    {form.id ? (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-xl border px-4 py-2 text-sm"
                        >
                            Отмена
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={disabled || submitting}
                        className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {submitting ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            </div>
            <div className="rounded-2xl border bg-white p-5">
                <div className="mb-4 text-base font-semibold">Опции характеристики</div>

                {items.length === 0 ? (
                    <div className="text-sm text-gray-500">
                        Опции пока не созданы
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div key={item.id} className="rounded-xl border p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-gray-500">
                                            sort: {item.sort_order}, {item.is_active ? "активна" : "неактивна"}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => startEdit(item)}
                                            className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
                                        >
                                            Редактировать
                                        </button>

                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => setDeleteTarget(item)}
                                            className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 disabled:opacity-50"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление опции"
                message={
                    deleteTarget
                        ? `Удалить опцию "${deleteTarget.name}"?`
                        : ""
                }
                confirmText="Удалить"
                loading={deleting}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            />
        </div>
    );
}
