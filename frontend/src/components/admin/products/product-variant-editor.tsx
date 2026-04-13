"use client";

import { useMemo, useState } from "react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import {
    createProductVariant,
    deleteProductVariant,
    updateProductVariant,
    type AdminProductVariantItem,
} from "@/lib/admin-product-variants-api";

type Props = {
    productId: number;
    items: AdminProductVariantItem[];
    onReload: () => Promise<void>;
};

type VariantFormState = {
    id?: number;
    title: string;
    volume: string;
    volume_unit: string;
    type: string;
    concentration: string;
    edition: string;
    price: string;
    old_price: string;
    stock: string;
    is_preorder: boolean;
    is_active: boolean;
    sort_order: string;
};

const emptyForm: VariantFormState = {
    title: "",
    volume: "",
    volume_unit: "ml",
    type: "",
    concentration: "",
    edition: "",
    price: "",
    old_price: "",
    stock: "0",
    is_preorder: false,
    is_active: true,
    sort_order: "0",
};

function toFormState(item: AdminProductVariantItem): VariantFormState {
    return {
        id: item.id,
        title: item.title || "",
        volume: item.volume != null ? String(item.volume) : "",
        volume_unit: item.volume_unit || "ml",
        type: item.type || "",
        concentration: item.concentration || "",
        edition: item.edition || "",
        price: item.price != null ? String(item.price) : "",
        old_price: item.old_price != null ? String(item.old_price) : "",
        stock: item.stock != null ? String(item.stock) : "0",
        is_preorder: !!item.is_preorder,
        is_active: item.is_active ?? true,
        sort_order: item.sort_order != null ? String(item.sort_order) : "0",
    };
}

function formatMoney(value?: string | null) {
    if (!value) {
        return "—";
    }

    return `${value} BYN`;
}

function buildDisplayName(item: AdminProductVariantItem) {
    if (item.display_name) {
        return item.display_name;
    }

    const parts: string[] = [];

    if (item.volume) {
        parts.push(`${item.volume}${item.volume_unit ? ` ${item.volume_unit}` : ""}`);
    }

    if (item.concentration) {
        parts.push(item.concentration.toUpperCase());
    }

    if (item.edition) {
        parts.push(item.edition);
    }

    return parts.length > 0 ? parts.join(" / ") : item.title;
}

function VariantBadges({ item }: { item: AdminProductVariantItem }) {
    return (
        <div className="flex flex-wrap gap-2">
            {item.is_active ? (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
                    Активен
                </span>
            ) : (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                    Выключен
                </span>
            )}

            {item.is_preorder ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                    Предзаказ
                </span>
            ) : null}
        </div>
    );
}

function VariantFormFields({
                               form,
                               setForm,
                           }: {
    form: VariantFormState;
    setForm: React.Dispatch<React.SetStateAction<VariantFormState>>;
}) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm text-gray-600">Название *</label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Тип</label>
                    <input
                        type="text"
                        value={form.type}
                        onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="Парфюмерная вода"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Объём</label>
                    <input
                        type="number"
                        value={form.volume}
                        onChange={(e) => setForm((prev) => ({ ...prev, volume: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Единица объёма</label>
                    <input
                        type="text"
                        value={form.volume_unit}
                        onChange={(e) => setForm((prev) => ({ ...prev, volume_unit: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="ml"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Концентрация</label>
                    <input
                        type="text"
                        value={form.concentration}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, concentration: e.target.value }))
                        }
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="edp / edt / parfum"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Edition</label>
                    <input
                        type="text"
                        value={form.edition}
                        onChange={(e) => setForm((prev) => ({ ...prev, edition: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="tester / limited edition"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Цена</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Старая цена</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.old_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, old_price: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Остаток</label>
                    <input
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-gray-600">Порядок сортировки</label>
                    <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, sort_order: e.target.value }))
                        }
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={form.is_preorder}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, is_preorder: e.target.checked }))
                        }
                    />
                    <span>Предзаказ</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                        }
                    />
                    <span>Активен</span>
                </label>
            </div>
        </div>
    );
}

export default function ProductVariantsEditor({
                                                  productId,
                                                  items,
                                                  onReload,
                                              }: Props) {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState<VariantFormState>(emptyForm);

    const [editForm, setEditForm] = useState<VariantFormState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminProductVariantItem | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const sortA = a.sort_order ?? 0;
            const sortB = b.sort_order ?? 0;

            if (sortA !== sortB) {
                return sortA - sortB;
            }

            return a.id - b.id;
        });
    }, [items]);

    const openCreate = () => {
        setCreateForm(emptyForm);
        setCreateModalOpen(true);
        setError("");
        setSuccess("");
    };

    const openEdit = (item: AdminProductVariantItem) => {
        setEditForm(toFormState(item));
        setError("");
        setSuccess("");
    };

    const handleCreate = async () => {
        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!createForm.title.trim()) {
            setError("Укажи название варианта");
            setSubmitting(false);
            return;
        }

        try {
            const result = await createProductVariant(productId, {
                title: createForm.title.trim(),
                volume: createForm.volume ? Number(createForm.volume) : null,
                volume_unit: createForm.volume_unit || null,
                type: createForm.type || null,
                concentration: createForm.concentration || null,
                edition: createForm.edition || null,
                price: createForm.price || null,
                old_price: createForm.old_price || null,
                stock: Number(createForm.stock || 0),
                is_preorder: createForm.is_preorder,
                is_active: createForm.is_active,
                sort_order: Number(createForm.sort_order || 0),
            });

            setSuccess(result.message || "Вариант добавлен");
            setCreateModalOpen(false);
            setCreateForm(emptyForm);
            await onReload();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания варианта");
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

        if (!editForm.title.trim()) {
            setError("Укажи название варианта");
            setSubmitting(false);
            return;
        }

        try {
            const result = await updateProductVariant(productId, editForm.id, {
                title: editForm.title.trim(),
                volume: editForm.volume ? Number(editForm.volume) : null,
                volume_unit: editForm.volume_unit || null,
                type: editForm.type || null,
                concentration: editForm.concentration || null,
                edition: editForm.edition || null,
                price: editForm.price || null,
                old_price: editForm.old_price || null,
                stock: Number(editForm.stock || 0),
                is_preorder: editForm.is_preorder,
                is_active: editForm.is_active,
                sort_order: Number(editForm.sort_order || 0),
            });

            setSuccess(result.message || "Вариант обновлен");
            setEditForm(null);
            await onReload();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка обновления варианта");
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
            const result = await deleteProductVariant(productId, deleteTarget.id);
            setSuccess(result.message || "Вариант удален");
            setDeleteTarget(null);
            await onReload();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления варианта");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
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
                    <div className="text-base font-semibold">Варианты товара</div>

                    <button
                        type="button"
                        onClick={openCreate}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                    >
                        Добавить вариант
                    </button>
                </div>

                {sortedItems.length === 0 ? (
                    <div className="text-sm text-gray-500">
                        У товара пока нет вариантов
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedItems.map((item) => (
                            <div key={item.id} className="rounded-xl border p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-3">
                                        <div>
                                            <div className="text-sm font-medium">
                                                {item.title}
                                            </div>

                                            <div className="mt-1 text-xs text-gray-500">
                                                {buildDisplayName(item)} • Порядок: {item.sort_order ?? 0}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
                                            <div>Цена: {formatMoney(item.price)}</div>
                                            <div>Старая цена: {formatMoney(item.old_price)}</div>
                                            <div>Остаток: {item.stock ?? 0}</div>
                                            <div>Тип: {item.type || "—"}</div>
                                        </div>

                                        <VariantBadges item={item} />
                                    </div>

                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(item)}
                                            className="rounded-md border px-2.5 py-1 text-xs"
                                        >
                                            Редактировать
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(item)}
                                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600"
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
                title="Удаление варианта"
                message={
                    deleteTarget
                        ? `Удалить вариант "${deleteTarget.title}"?`
                        : ""
                }
                confirmText="Удалить"
                loading={deleting}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            />

            {createModalOpen ? (
                <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold">Добавить вариант товара</h2>
                            </div>

                            <div className="overflow-y-auto px-5 py-4">
                                <VariantFormFields form={createForm} setForm={setCreateForm} />
                            </div>

                            <div className="flex justify-end gap-2 border-t px-5 py-4">
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
                </div>
            ) : null}

            {editForm ? (
                <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold">Редактировать вариант</h2>
                            </div>

                            <div className="overflow-y-auto px-5 py-4">
                                <VariantFormFields
                                    form={editForm}
                                    setForm={(updater) => {
                                        setEditForm((prev) => {
                                            if (!prev) {
                                                return prev;
                                            }

                                            return typeof updater === "function" ? updater(prev) : updater;
                                        });
                                    }}
                                />                            </div>

                            <div className="flex justify-end gap-2 border-t px-5 py-4">
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
                </div>
            ) : null}
        </div>
    );
}