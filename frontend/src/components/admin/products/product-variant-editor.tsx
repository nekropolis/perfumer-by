"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import {
    createProductVariant,
    deleteProductVariant,
    fetchProductVariants,
    fetchVariantDefinitions,
    updateProductVariant,
    type AdminProductVariantItem,
    type VariantDefinitionItem,
} from "@/lib/admin-product-variants-api";
import ProductVariantSuppliersModal from "@/components/admin/products/product-variant-suppliers-modal";

type Props = {
    productId: number;
    productName: string;
    productBrandName?: string | null;
    items: AdminProductVariantItem[];
    onReloadAction: () => Promise<void>;
};

type VariantFormState = {
    id?: number;
    variant_definition_id: string;
    variant_definition_title: string;
    price: string;
    old_price: string;
    stock: string;
    is_preorder: boolean;
    is_active: boolean;
    sort_order: string;
};

const emptyForm: VariantFormState = {
    variant_definition_id: "",
    variant_definition_title: "",
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
        variant_definition_id: item.variant_definition_id != null ? String(item.variant_definition_id) : "",
        variant_definition_title: item.definition?.title || item.title || "",
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
    return item.title || item.display_name || "Без параметров";
}

/** Строка для заголовка модалки: «100 мл / EDP - парфюмерная вода». */
function formatVariantEditTitle(item: AdminProductVariantItem): string {
    const def = item.definition;
    if (def) {
        const tester = def.is_tester ? " · Тестер" : "";
        const code = def.concentration_code?.trim();
        const label = def.concentration_label?.trim();
        if (code && label) {
            return `${def.volume_ml} мл / ${code} - ${label}${tester}`;
        }
        if (label) {
            return `${def.volume_ml} мл / ${label}${tester}`;
        }
        return `${def.volume_ml} мл${tester}`;
    }

    const parts: string[] = [];
    if (item.volume != null) {
        parts.push(
            String(item.volume) + (item.volume_unit ? ` ${item.volume_unit}` : " мл"),
        );
    }
    if (item.concentration?.trim()) {
        parts.push(item.concentration.trim());
    }
    if (item.type?.trim()) {
        parts.push(item.type.trim());
    }
    if (parts.length > 0) {
        return parts.join(" / ") + (item.edition ? ` (${item.edition})` : "");
    }

    return buildDisplayName(item);
}

function extractMlSearch(query: string): string | undefined {
    const trimmed = query.trim();
    if (!trimmed) {
        return undefined;
    }

    const match = trimmed.match(/\d+/);
    return match ? match[0] : undefined;
}

function VariantBadges({ item }: { item: AdminProductVariantItem }) {
    const hasStock = Number(item.main_available_stock ?? 0) > 0;
    const storefrontAvailable = Boolean(item.is_available);
    const hasSupplier =
        storefrontAvailable &&
        !hasStock &&
        Number(item.active_supplier_offers_count ?? 0) > 0;
    const hasPreorder = Boolean(item.is_preorder);
    const onListingSwitch = Boolean(item.is_active);

    /**
     * Совпадает с бэком `Product::activeVariants()`: на сайт без предзаказа попадают
     * только связки с `is_active`, при предзаказе — независимо от флага.
     * Бейдж «Активен» по остатку/поставщику без `is_active` вводил в заблуждение.
     */
    const primary = hasPreorder
        ? {
            label: "Предзаказ",
            className: "bg-amber-50 text-amber-800",
            title:
                "Витрина: предзаказ (может отображаться в каталоге даже при выключенном «Активен»). Каналы отгрузки — см. чипы справа.",
        }
        : onListingSwitch
            ? {
                label: "На витрине",
                className: "bg-green-50 text-green-700",
                title:
                    "Витрина: включён «Активен». На сайте показывается, если есть канал отгрузки (склад main/supplier или активный оффер поставщика).",
            }
            : {
                label: "Выкл",
                className: "bg-gray-100 text-admin-text-secondary",
                title:
                    "Витрина: «Активен» выключен — вариант не отдаётся в публичный API каталога. Остаток/поставщик ниже — только подготовка канала.",
            };

    const supplierTitle =
        !onListingSwitch && !hasPreorder && hasSupplier
            ? "Есть активные офферы, но на сайте вариант скрыт: включите «Активен»."
            : "Активные офферы поставщика (по прайсу, без блокирующих флагов в payload).";

    const channelTags: Array<{ key: string; label: string; className: string; title: string }> = [];
    if (hasStock) {
        channelTags.push({
            key: "stock",
            label: "Остаток",
            className: "bg-emerald-50 text-emerald-700",
            title: "На основном складе есть доступное количество.",
        });
    }
    if (hasSupplier) {
        channelTags.push({
            key: "supplier",
            label: "Поставщик",
            className: "bg-blue-50 text-blue-700",
            title: supplierTitle,
        });
    }

    return (
        <div className="flex flex-wrap items-center gap-1">
            <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${primary.className}`}
                title={primary.title}
            >
                {primary.label}
            </span>

            {channelTags.map((tag) => (
                <span
                    key={tag.key}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tag.className}`}
                    title={tag.title}
                >
                    {tag.label}
                </span>
            ))}
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
                    <label className="mb-1 block text-sm text-admin-text-secondary">Цена</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Старая цена</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.old_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, old_price: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Остаток</label>
                    <input
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Порядок сортировки</label>
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
                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
                    <input
                        type="checkbox"
                        checked={form.is_preorder}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, is_preorder: e.target.checked }))
                        }
                    />
                    <span>Предзаказ</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-admin-text">
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
    productName,
    productBrandName,
    items,
    onReloadAction,
}: Props) {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState<VariantFormState>(emptyForm);
    const [variantSearch, setVariantSearch] = useState("");
    const [variantDefinitions, setVariantDefinitions] = useState<VariantDefinitionItem[]>([]);
    const [variantDefinitionsLoading, setVariantDefinitionsLoading] = useState(false);
    const debouncedCreateSearch = useDebouncedValue(variantSearch, 250);

    const [editForm, setEditForm] = useState<VariantFormState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminProductVariantItem | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [suppliersModalOpen, setSuppliersModalOpen] = useState(false);
    const [suppliersModalFocusId, setSuppliersModalFocusId] = useState<number | null>(null);
    const [runtimeItems, setRuntimeItems] = useState<AdminProductVariantItem[]>(items);

    const loadVariants = useCallback(async () => {
        const response = await fetchProductVariants(productId);
        setRuntimeItems(response.data || []);
    }, [productId]);

    useEffect(() => {
        setRuntimeItems(items);
    }, [items]);

    useEffect(() => {
        void loadVariants();
    }, [loadVariants]);

    const sortedItems = useMemo(() => {
        return [...runtimeItems].sort((a, b) => {
            const sortA = a.sort_order ?? 0;
            const sortB = b.sort_order ?? 0;

            if (sortA !== sortB) {
                return sortA - sortB;
            }

            return a.id - b.id;
        });
    }, [runtimeItems]);

    const editModalVariantTitle = useMemo(() => {
        if (!editForm?.id) {
            return "";
        }
        const row = runtimeItems.find((i) => i.id === editForm.id);
        return row ? formatVariantEditTitle(row) : editForm.variant_definition_title || "";
    }, [editForm?.id, editForm?.variant_definition_title, runtimeItems]);

    const openInfo = (item: AdminProductVariantItem) => {
        setSuppliersModalFocusId(item.id);
        setSuppliersModalOpen(true);
    };

    const closeSuppliersModal = () => {
        setSuppliersModalOpen(false);
        setSuppliersModalFocusId(null);
    };

    const openCreate = () => {
        setCreateForm(emptyForm);
        setVariantSearch("");
        setCreateModalOpen(true);
        setError("");
        setSuccess("");
        void loadDefinitions("", true);
    };

    const loadDefinitions = useCallback(async (query: string, excludeLinkedToProduct: boolean) => {
        setVariantDefinitionsLoading(true);
        try {
            const data = await fetchVariantDefinitions({
                search: extractMlSearch(query),
                product_id: excludeLinkedToProduct ? productId : undefined,
            });
            setVariantDefinitions(data.data || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки таблицы вариантов");
        } finally {
            setVariantDefinitionsLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        if (!createModalOpen) return;
        void loadDefinitions(debouncedCreateSearch, true);
    }, [createModalOpen, debouncedCreateSearch, loadDefinitions]);

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
                variant_definition_id: createForm.variant_definition_id
                    ? Number(createForm.variant_definition_id)
                    : null,
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
            await loadVariants();
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
                variant_definition_id: editForm.variant_definition_id
                    ? Number(editForm.variant_definition_id)
                    : null,
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
            await loadVariants();
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
            await loadVariants();
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

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={openCreate}
                            className="rounded-lg border px-3 py-1.5 text-sm"
                        >
                            Добавить вариант
                        </button>
                    </div>
                </div>

                {sortedItems.length === 0 ? (
                    <div className="text-sm text-admin-text-secondary">
                        У товара пока нет вариантов
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedItems.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-xl border px-3 py-3 transition-colors hover:border-gray-300 hover:bg-admin-muted/60"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                                    <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-[78px_minmax(0,1.8fr)_minmax(110px,1fr)_96px_56px] sm:items-center sm:gap-3">
                                        <div className="min-w-0">
                                            <VariantBadges item={item} />
                                        </div>

                                        <div className="min-w-0 text-sm font-medium leading-5 text-admin-text break-words">
                                            {buildDisplayName(item)}
                                        </div>

                                        <div className="text-sm font-medium text-admin-text whitespace-nowrap">
                                            {item.catalog_list_price != null
                                                ? formatMoney(String(item.catalog_list_price))
                                                : "—"}
                                        </div>

                                        <div
                                            className="text-sm text-admin-text-secondary whitespace-nowrap"
                                            title={item.fulfillment_tooltip?.trim() || undefined}
                                        >
                                            {item.available_stock ?? item.main_available_stock ?? 0} шт.
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[124px] sm:justify-end sm:pt-0.5">
                                        <div className="flex items-center gap-1.5 sm:hidden">
                                            <button
                                                type="button"
                                                onClick={() => openInfo(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                                                title="Информация о привязках"
                                                aria-label="Информация о привязках"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    className="h-3.5 w-3.5"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18z" />
                                                </svg>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => openEdit(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-admin-text transition hover:bg-white"
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
                                                onClick={() => openInfo(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                                                title="Информация о привязках"
                                                aria-label="Информация о привязках"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    className="h-3.5 w-3.5"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18z" />
                                                </svg>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => openEdit(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-admin-text transition hover:bg-white"
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

            <ProductVariantSuppliersModal
                open={suppliersModalOpen}
                onCloseAction={closeSuppliersModal}
                productId={productId}
                productName={productName}
                productBrandName={productBrandName}
                highlightVariantId={suppliersModalFocusId}
                singleVariantId={suppliersModalFocusId}
            />

            {createModalOpen ? (
                <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold">Добавить вариант товара</h2>
                            </div>

                            <div className="overflow-y-auto px-5 py-4">
                                <div className="mb-4 space-y-2 rounded-xl border bg-admin-muted p-3">
                                    <label className="block text-sm text-admin-text-secondary">Поиск варианта в справочнике</label>
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            type="text"
                                            value={variantSearch}
                                            onChange={(e) => setVariantSearch(e.target.value)}
                                            className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
                                            placeholder="Например: 100"
                                        />
                                        <span className="inline-flex items-center text-xs text-admin-text-secondary">
                                            Живой поиск по мл
                                        </span>
                                    </div>
                                    {variantDefinitionsLoading ? (
                                        <div className="text-xs text-admin-text-secondary">Поиск...</div>
                                    ) : null}
                                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-white p-2">
                                        {variantDefinitions.length === 0 ? (
                                            <div className="px-2 py-2 text-xs text-admin-text-secondary">
                                                Ничего не найдено по объему
                                            </div>
                                        ) : (
                                            variantDefinitions.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setCreateForm((prev) => ({
                                                            ...prev,
                                                            variant_definition_id: String(item.id),
                                                            variant_definition_title: item.title,
                                                        }))
                                                    }
                                                    className={`block w-full rounded-lg px-2 py-2 text-left text-sm ${createForm.variant_definition_id === String(item.id)
                                                        ? "bg-admin-primary text-white"
                                                        : "hover:bg-admin-muted"
                                                        }`}
                                                >
                                                    {item.title}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                    <div className="text-xs text-admin-text-secondary">
                                        Выбрано: {createForm.variant_definition_title || "—"}
                                    </div>
                                </div>
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
                                    className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                                >
                                    {submitting ? "Сохранение..." : "Сохранить"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {editForm ? (
                <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                            <div className="border-b px-5 py-4">
                                <h2 className="text-lg font-semibold leading-snug text-admin-text">
                                    Редактировать вариант
                                </h2>
                                {editModalVariantTitle ? (
                                    <p className="mt-1 text-base font-medium text-admin-text">
                                        {editModalVariantTitle}
                                    </p>
                                ) : null}
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
                                    className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
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