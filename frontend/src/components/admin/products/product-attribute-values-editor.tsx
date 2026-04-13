"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import type { AttributeType } from "@/lib/admin-attributes-api";
import {
    createProductAttributeValue,
    deleteProductAttributeValue,
    updateProductAttributeValue,
    type ProductAttributeBindingItem,
} from "@/lib/admin-product-attribute-values-api";

type BindingAttributeOption = {
    id: number;
    name: string;
    sort_order: number;
};

type BindingAttributeItem = {
    id: number;
    name: string;
    type: AttributeType;
    options: BindingAttributeOption[];
};

type Props = {
    productId: number;
    items: ProductAttributeBindingItem[];
    attributes: BindingAttributeItem[];
    onReload: () => Promise<void>;
};

type ModalFormState = {
    id?: number;
    attribute_id: string;
    option_ids: number[];
    custom_value: string;
    sort_order: string;
};

const emptyForm: ModalFormState = {
    attribute_id: "",
    option_ids: [],
    custom_value: "",
    sort_order: "0",
};

function renderSelectedValues(item: ProductAttributeBindingItem) {
    if (item.selected_options && item.selected_options.length > 0) {
        return item.selected_options.map((option) => ({
            key: `selected-${option.id}`,
            label: option.name,
        }));
    }

    if (item.custom_value) {
        return [
            {
                key: `custom-${item.id}`,
                label: item.custom_value,
            },
        ];
    }

    return [];
}

function OptionBadges({
                          values,
                          emptyLabel = "Не выбрано",
                      }: {
    values: Array<{ key: string; label: string }>;
    emptyLabel?: string;
}) {
    if (values.length === 0) {
        return <div className="text-sm text-gray-500">{emptyLabel}</div>;
    }

    return (
        <div className="flex flex-wrap gap-2">
            {values.map((value) => (
                <span
                    key={value.key}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                >
                    {value.label}
                </span>
            ))}
        </div>
    );
}

function OptionPicker({
                          attribute,
                          value,
                          onChange,
                          placeholder,
                      }: {
    attribute: BindingAttributeItem;
    value: number[];
    onChange: (nextIds: number[]) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const openPicker = () => {
        setOpen(true);
    };

    const closePicker = () => {
        setOpen(false);
        setSearch("");
    };

    const togglePicker = () => {
        if (open) {
            closePicker();
        } else {
            openPicker();
        }
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (!containerRef.current) {
                return;
            }

            if (!containerRef.current.contains(event.target as Node)) {
                closePicker();
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const id = requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });

        return () => cancelAnimationFrame(id);
    }, [open]);

    const selectedOptions = attribute.options.filter((option) => value.includes(option.id));

    const selectedNames = selectedOptions.map((option) => ({
        key: `picker-${option.id}`,
        label: option.name,
        id: option.id,
    }));

    const normalizedSearch = search.trim().toLowerCase();

    const filteredOptions = attribute.options.filter((option) =>
        option.name.toLowerCase().includes(normalizedSearch)
    );

    const toggleOption = (optionId: number) => {
        if (attribute.type === "select") {
            onChange(value.includes(optionId) ? [] : [optionId]);
            return;
        }

        if (value.includes(optionId)) {
            onChange(value.filter((id) => id !== optionId));
            return;
        }

        onChange(Array.from(new Set([...value, optionId])));
    };

    const removeOption = (optionId: number) => {
        onChange(value.filter((id) => id !== optionId));
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="rounded-xl border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        {selectedNames.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {selectedNames.map((name) => (
                                    <span
                                        key={name.key}
                                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                                    >
                                        <span>{name.label}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeOption(name.id);
                                            }}
                                            className="rounded-full px-1 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800"
                                            aria-label={`Удалить ${name.label}`}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="pt-1 text-sm text-gray-500">
                                {placeholder || "Выбери значения"}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={togglePicker}
                        className="shrink-0 rounded-lg border px-3 py-1.5 text-sm"
                    >
                        {open ? "Закрыть" : "Выбрать"}
                    </button>
                </div>
            </div>

            {open ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border bg-white p-3 shadow-xl">
                    {attribute.options.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-gray-500">
                            У этого атрибута ещё нет опций
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Поиск по значениям"
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="max-h-64 overflow-y-auto">
                                {filteredOptions.length === 0 ? (
                                    <div className="px-2 py-3 text-sm text-gray-500">
                                        Ничего не найдено
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredOptions.map((option) => {
                                            const checked = value.includes(option.id);

                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => toggleOption(option.id)}
                                                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                                                        checked
                                                            ? "bg-black text-white"
                                                            : "hover:bg-gray-50"
                                                    }`}
                                                >
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {option.name}
                                                    </span>
                                                    <span className="shrink-0 text-xs">
                                                        {checked
                                                            ? "Выбрано"
                                                            : attribute.type === "select"
                                                                ? "Выбрать"
                                                                : "Добавить"}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

export default function ProductAttributeValuesEditor({
                                                         productId,
                                                         items,
                                                         attributes,
                                                         onReload,
                                                     }: Props) {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState<ModalFormState>(emptyForm);

    const [editForm, setEditForm] = useState<ModalFormState | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<ProductAttributeBindingItem | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const usedAttributeIds = useMemo(() => {
        return new Set(items.map((item) => item.attribute?.id).filter(Boolean));
    }, [items]);

    const availableAttributes = useMemo(() => {
        return attributes.filter((attribute) => !usedAttributeIds.has(attribute.id));
    }, [attributes, usedAttributeIds]);

    const selectedCreateAttribute = useMemo(() => {
        return attributes.find((item) => String(item.id) === createForm.attribute_id) || null;
    }, [attributes, createForm.attribute_id]);

    const selectedEditAttribute = useMemo(() => {
        if (!editForm?.attribute_id) {
            return null;
        }

        return attributes.find((item) => String(item.id) === editForm.attribute_id) || null;
    }, [attributes, editForm]);

    const openCreate = () => {
        setCreateForm(emptyForm);
        setCreateModalOpen(true);
        setError("");
        setSuccess("");
    };

    const openEdit = (item: ProductAttributeBindingItem) => {
        setEditForm({
            id: item.id,
            attribute_id: item.attribute?.id ? String(item.attribute.id) : "",
            option_ids: item.selected_options?.map((option) => option.id) || [],
            custom_value: item.custom_value || "",
            sort_order: String(item.sort_order ?? 0),
        });
        setError("");
        setSuccess("");
    };

    const handleCreate = async () => {
        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!createForm.attribute_id) {
            setError("Выбери атрибут");
            setSubmitting(false);
            return;
        }

        try {
            const payload = {
                attribute_id: Number(createForm.attribute_id),
                option_ids: selectedCreateAttribute?.type === "text" ? [] : createForm.option_ids,
                custom_value:
                    selectedCreateAttribute?.type === "text"
                        ? createForm.custom_value || null
                        : null,
                sort_order: Number(createForm.sort_order || 0),
            };

            const result = await createProductAttributeValue(productId, payload);

            setSuccess(result.message || "Атрибут привязан");
            setCreateModalOpen(false);
            setCreateForm(emptyForm);
            await onReload();
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка привязки атрибута"
            );
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
            const payload = {
                option_ids: selectedEditAttribute?.type === "text" ? [] : editForm.option_ids,
                custom_value:
                    selectedEditAttribute?.type === "text"
                        ? editForm.custom_value || null
                        : null,
                sort_order: Number(editForm.sort_order || 0),
            };

            const result = await updateProductAttributeValue(productId, editForm.id, payload);

            setSuccess(result.message || "Атрибут обновлен");
            setEditForm(null);
            await onReload();
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка обновления атрибута"
            );
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
            const result = await deleteProductAttributeValue(productId, deleteTarget.id);
            setSuccess(result.message || "Атрибут отвязан");
            setDeleteTarget(null);
            await onReload();
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка удаления атрибута"
            );
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
                    <div className="text-base font-semibold">Привязанные атрибуты</div>

                    <button
                        type="button"
                        onClick={openCreate}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                    >
                        Добавить атрибут
                    </button>
                </div>

                {items.length === 0 ? (
                    <div className="text-sm text-gray-500">
                        У товара пока нет привязанных атрибутов
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => {
                            const selectedValues = renderSelectedValues(item);

                            return (
                                <div key={item.id} className="rounded-xl border p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div>
                                                <div className="text-sm font-medium">
                                                    {item.attribute?.name || "Атрибут"}
                                                </div>
                                                <div className="mt-1 text-xs text-gray-500">
                                                    {item.attribute?.type === "text"
                                                        ? "Текст"
                                                        : item.attribute?.type === "select"
                                                            ? "Один из списка"
                                                            : "Несколько из списка"}
                                                    {` • Порядок: ${item.sort_order}`}
                                                </div>
                                            </div>

                                            <OptionBadges
                                                values={selectedValues}
                                                emptyLabel="Значение не выбрано"
                                            />
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
                                                Отвязать
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Отвязка атрибута"
                message={
                    deleteTarget
                        ? `Отвязать атрибут "${deleteTarget.attribute?.name || "атрибут"}" от товара?`
                        : ""
                }
                confirmText="Отвязать"
                loading={deleting}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            />

            {createModalOpen ? (
                <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold">Добавить атрибут к товару</h2>
                            </div>

                            <div className="space-y-4 overflow-y-auto px-5 py-4">
                                <div>
                                    <label className="mb-1 block text-sm text-gray-600">
                                        Атрибут
                                    </label>
                                    <select
                                        value={createForm.attribute_id}
                                        onChange={(e) =>
                                            setCreateForm({
                                                attribute_id: e.target.value,
                                                option_ids: [],
                                                custom_value: "",
                                                sort_order: "0",
                                            })
                                        }
                                        className="w-full rounded-xl border px-3 py-2 text-sm"
                                    >
                                        <option value="">Выбери атрибут</option>
                                        {availableAttributes.map((attribute) => (
                                            <option key={attribute.id} value={attribute.id}>
                                                {attribute.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedCreateAttribute?.type === "text" ? (
                                    <div>
                                        <label className="mb-1 block text-sm text-gray-600">
                                            Значение
                                        </label>
                                        <textarea
                                            value={createForm.custom_value}
                                            onChange={(e) =>
                                                setCreateForm({
                                                    ...createForm,
                                                    custom_value: e.target.value,
                                                })
                                            }
                                            className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                                        />
                                    </div>
                                ) : null}

                                {(selectedCreateAttribute?.type === "select" ||
                                    selectedCreateAttribute?.type === "multiselect") &&
                                selectedCreateAttribute ? (
                                    <div className="space-y-2">
                                        <label className="block text-sm text-gray-600">
                                            Выбранные значения
                                        </label>
                                        <OptionPicker
                                            attribute={selectedCreateAttribute}
                                            value={createForm.option_ids}
                                            onChange={(nextIds) =>
                                                setCreateForm({
                                                    ...createForm,
                                                    option_ids: nextIds,
                                                })
                                            }
                                        />
                                    </div>
                                ) : null}

                                <div>
                                    <label className="mb-1 block text-sm text-gray-600">
                                        Порядок сортировки
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
                    <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold">Редактировать атрибут</h2>
                            </div>

                            <div className="space-y-4 overflow-y-auto px-5 py-4">
                                <div>
                                    <label className="mb-1 block text-sm text-gray-600">
                                        Атрибут
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedEditAttribute?.name || ""}
                                        disabled
                                        className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-600"
                                    />
                                </div>

                                {selectedEditAttribute?.type === "text" ? (
                                    <div>
                                        <label className="mb-1 block text-sm text-gray-600">
                                            Значение
                                        </label>
                                        <textarea
                                            value={editForm.custom_value}
                                            onChange={(e) =>
                                                setEditForm({
                                                    ...editForm,
                                                    custom_value: e.target.value,
                                                })
                                            }
                                            className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                                        />
                                    </div>
                                ) : null}

                                {(selectedEditAttribute?.type === "select" ||
                                    selectedEditAttribute?.type === "multiselect") &&
                                selectedEditAttribute ? (
                                    <div className="space-y-2">
                                        <label className="block text-sm text-gray-600">
                                            Выбранные значения
                                        </label>
                                        <OptionPicker
                                            attribute={selectedEditAttribute}
                                            value={editForm.option_ids}
                                            onChange={(nextIds) =>
                                                setEditForm({
                                                    ...editForm,
                                                    option_ids: nextIds,
                                                })
                                            }
                                        />
                                    </div>
                                ) : null}

                                <div>
                                    <label className="mb-1 block text-sm text-gray-600">
                                        Порядок сортировки
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
                            </div>

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
