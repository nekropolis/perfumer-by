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
    onReloadAction: () => Promise<void>;
};

type VariantFormState = {
    id?: number;
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

    return parts.length > 0 ? parts.join(" / ") : "Без параметров";
}

function VariantBadges({ item }: { item: AdminProductVariantItem }) {
    return (
        <div className="flex flex-wrap items-center gap-1">
            <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    item.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-600"
                }`}
            >
                {item.is_active ? "Активен" : "Выкл"}
            </span>

            {item.is_preorder ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
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
                                                  onReloadAction,
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

        try {
            const result = await createProductVariant(productId, {
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
            await onReloadAction();
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

        try {
            const result = await updateProductVariant(productId, editForm.id, {
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
            await onReloadAction();
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
            await onReloadAction();
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
                            <div
                                key={item.id}
                                className="rounded-xl border px-3 py-3 transition-colors hover:border-gray-300 hover:bg-gray-50/60"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                                    <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-[78px_minmax(0,1.8fr)_minmax(120px,1fr)_110px_70px] sm:items-center sm:gap-3">
                                        <div className="min-w-0">
                                            <VariantBadges item={item} />
                                        </div>

                                        <div className="min-w-0 text-sm font-medium leading-5 text-gray-900 break-words">
                                            {buildDisplayName(item)}
                                        </div>

                                        <div className="min-w-0 text-sm text-gray-600 break-words">
                                            {item.type || "—"}
                                        </div>

                                        <div className="text-sm font-medium text-gray-900">
                                            {formatMoney(item.price)}
                                        </div>

                                        <div className="text-sm text-gray-600">
                                            {item.stock ?? 0} шт.
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[210px] sm:justify-end sm:pt-0.5">
                                        <div className="flex items-center gap-1.5 sm:hidden">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-gray-700 transition hover:bg-white"
                                                title="Редактировать"
                                                aria-label="Редактировать"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    className="h-3.5 w-3.5"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M16.862 3.487a2.25 2.25 0 113.182 3.182L9.75 16.963 6 18l1.037-3.75L16.862 3.487z"
                                                    />
                                                </svg>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                                                title="Удалить"
                                                aria-label="Удалить"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    className="h-3.5 w-3.5"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M18 6L6 18M6 6l12 12"
                                                    />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="hidden w-full items-center justify-end gap-1.5 sm:flex">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(item)}
                                            className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-gray-700 transition hover:bg-white"
                                            title="Редактировать"
                                            aria-label="Редактировать"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                className="h-3.5 w-3.5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M16.862 3.487a2.25 2.25 0 113.182 3.182L9.75 16.963 6 18l1.037-3.75L16.862 3.487z"
                                                />
                                            </svg>
                                            <span>Редактировать</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(item)}
                                            className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2 text-[11px] text-red-600 transition hover:bg-red-50"
                                            title="Удалить"
                                            aria-label="Удалить"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                className="h-3.5 w-3.5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M18 6L6 18M6 6l12 12"
                                                />
                                            </svg>
                                            <span>Удалить</span>
                                        </button>
                                        </div>
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
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={handleDelete}
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