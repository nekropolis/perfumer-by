"use client";

import { useState } from "react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import type { AttributeOptionAdminItem } from "@/lib/admin-attributes-api";
import {
    createAttributeOption,
    deleteAttributeOption,
    updateAttributeOption,
} from "@/lib/admin-attributes-api";

type Props = {
    attributeId: number;
    items: AttributeOptionAdminItem[];
    disabled?: boolean;
    onReload: () => Promise<void>;
};

type FormState = {
    id?: number;
    name: string;
    sort_order: string;
    is_active: boolean;
};

const emptyForm: FormState = {
    name: "",
    sort_order: "0",
    is_active: true,
};

export default function AttributeOptionsManager({
                                                    attributeId,
                                                    items,
                                                    disabled = false,
                                                    onReload,
                                                }: Props) {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState<FormState>(emptyForm);

    const [editForm, setEditForm] = useState<FormState | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AttributeOptionAdminItem | null>(null);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const resetCreateForm = () => {
        setCreateForm(emptyForm);
    };

    const openCreate = () => {
        if (disabled) {
            return;
        }

        resetCreateForm();
        setCreateModalOpen(true);
        setError("");
        setSuccess("");
    };

    const openEdit = (item: AttributeOptionAdminItem) => {
        setEditForm({
            id: item.id,
            name: item.name,
            sort_order: String(item.sort_order ?? 0),
            is_active: item.is_active,
        });
        setError("");
        setSuccess("");
    };

    const handleCreate = async () => {
        if (disabled) {
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!createForm.name.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            const result = await createAttributeOption(attributeId, {
                name: createForm.name,
                sort_order: Number(createForm.sort_order || 0),
                is_active: createForm.is_active,
            });

            setSuccess(result.message || "Опция создана");
            setCreateModalOpen(false);
            resetCreateForm();
            await onReload();
        } catch (e: any) {
            setError(e?.message || "Ошибка создания опции");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async () => {
        if (!editForm?.id) {
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!editForm.name.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            const result = await updateAttributeOption(attributeId, editForm.id, {
                name: editForm.name,
                sort_order: Number(editForm.sort_order || 0),
                is_active: editForm.is_active,
            });

            setSuccess(result.message || "Опция обновлена");
            setEditForm(null);
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
                    Для текстового атрибута список опций не используется.
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

            <div className="rounded-2xl border bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-base font-semibold">Список опций</div>

                    <button
                        type="button"
                        onClick={openCreate}
                        disabled={disabled}
                        className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                        Добавить опцию
                    </button>
                </div>

                {items.length === 0 ? (
                    <div className="text-sm text-gray-500">Опции пока не созданы</div>
                ) : (
                    <div className="space-y-2">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-lg border px-3 py-2"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                            {item.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Sort: {item.sort_order}, {item.is_active ? "активна" : "неактивна"}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => !disabled && openEdit(item)}
                                            disabled={disabled}
                                            className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-50"
                                        >
                                            Редактировать
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(item)}
                                            disabled={disabled}
                                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 disabled:opacity-50"
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
            {createModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold">Добавить опцию</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    Название
                                </label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            name: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    Sort order
                                </label>
                                <input
                                    type="number"
                                    value={createForm.sort_order}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            sort_order: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={createForm.is_active}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            is_active: e.target.checked,
                                        })
                                    }
                                />
                                Активна
                            </label>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setCreateModalOpen(false)}
                                className="rounded-xl border px-4 py-2 text-sm"
                            >
                                Отмена
                            </button>

                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={submitting}
                                className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {submitting ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            {editForm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold">Редактировать опцию</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    Название
                                </label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) =>
                                        setEditForm({
                                            ...editForm,
                                            name: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    Sort order
                                </label>
                                <input
                                    type="number"
                                    value={editForm.sort_order}
                                    onChange={(e) =>
                                        setEditForm({
                                            ...editForm,
                                            sort_order: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editForm.is_active}
                                    onChange={(e) =>
                                        setEditForm({
                                            ...editForm,
                                            is_active: e.target.checked,
                                        })
                                    }
                                />
                                Активна
                            </label>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditForm(null)}
                                className="rounded-xl border px-4 py-2 text-sm"
                            >
                                Отмена
                            </button>

                            <button
                                type="button"
                                onClick={handleUpdate}
                                disabled={submitting}
                                className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {submitting ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
