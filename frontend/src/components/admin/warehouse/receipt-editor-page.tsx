"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import {
    createStockReceipt,
    fetchStockReceipt,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    postStockReceipt,
    updateStockReceipt,
    type StockReceiptPayload,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import { STOCK_RECEIPT_STATUS, getStockReceiptStatusLabel } from "@/lib/warehouse-document-status";
import { fetchProducts, type ProductAdminItem } from "@/lib/admin-products-api";
import {
    fetchVariantDefinitions,
    type VariantDefinitionItem,
} from "@/lib/admin-product-variants-api";

type ReceiptFormItem = {
    product_id: number | null;
    variant_id: number | null;
    variant_definition_id: number | null;
    product_name: string;
    variant_title: string;
    qty: number;
    supplier_price: string;
    supplier_sku: string;
};

type ReceiptFormState = {
    warehouse_id: number | null;
    supplier_id: number | null;
    supplier_code: string;
    supplier_name: string;
    received_at: string;
    comment: string;
    items: ReceiptFormItem[];
};

type DraftReceiptItem = {
    product_id: number | null;
    variant_definition_id: number | null;
    product_query: string;
    variant_query: string;
    qty: number;
    supplier_price: string;
    supplier_sku: string;
};

const emptyDraftItem = (): DraftReceiptItem => ({
    product_id: null,
    variant_definition_id: null,
    product_query: "",
    variant_query: "",
    qty: 1,
    supplier_price: "",
    supplier_sku: "",
});

const emptyForm = (): ReceiptFormState => ({
    warehouse_id: null,
    supplier_id: null,
    supplier_code: "",
    supplier_name: "",
    received_at: new Date().toISOString().slice(0, 16),
    comment: "",
    items: [],
});

type Props = {
    receiptId?: number;
};

export default function ReceiptEditorPage({ receiptId }: Props) {
    const router = useRouter();
    const isEdit = typeof receiptId === "number";

    const [form, setForm] = useState<ReceiptFormState>(emptyForm());
    const [draftItem, setDraftItem] = useState<DraftReceiptItem>(emptyDraftItem());
    const [suppliers, setSuppliers] = useState<WarehouseSupplierOption[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [productOptions, setProductOptions] = useState<ProductAdminItem[]>([]);
    const [variantOptions, setVariantOptions] = useState<VariantDefinitionItem[]>([]);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [receiptStatus, setReceiptStatus] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState("");

    const loadProducts = useCallback(async (query: string) => {
        try {
            const response = await fetchProducts({
                page: 1,
                search: query.trim() || undefined,
            });
            setProductOptions(response.data ?? []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadVariantDefinitions = useCallback(async (searchQuery = "") => {
        try {
            const response = await fetchVariantDefinitions({
                search: searchQuery.trim() || undefined,
            });
            setVariantOptions(response.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить варианты");
        }
    }, []);

    useEffect(() => {
        const loadSuppliers = async () => {
            try {
                const response = await fetchWarehouseSuppliers();
                setSuppliers(response.data ?? []);
            } catch (e) {
                console.error(e);
            }
        };

        const loadWarehouses = async () => {
            try {
                const response = await fetchWarehouses();
                setWarehouses(response.data ?? []);
                const defaultWarehouse = (response.data ?? []).find((item) => item.code === "main");
                if (defaultWarehouse) {
                    setForm((prev) => ({ ...prev, warehouse_id: prev.warehouse_id ?? defaultWarehouse.id }));
                }
            } catch (e) {
                console.error(e);
            }
        };

        void loadSuppliers();
        void loadWarehouses();
        void loadProducts("");
    }, [loadProducts]);

    useEffect(() => {
        if (!isEdit || !receiptId) {
            return;
        }

        const loadReceipt = async () => {
            setLoading(true);
            setError("");

            try {
                const response = await fetchStockReceipt(receiptId);
                const receipt = response.data;
                const nextForm: ReceiptFormState = {
                    warehouse_id: receipt.warehouse_id ?? null,
                    supplier_id: receipt.supplier_id ?? null,
                    supplier_code: receipt.supplier_code ?? "",
                    supplier_name: receipt.supplier_name ?? "",
                    received_at: receipt.received_at ? receipt.received_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
                    comment: receipt.comment ?? "",
                    items: (receipt.items ?? []).map((item) => ({
                        product_id: item.product_id,
                        variant_id: item.variant_id ?? null,
                        variant_definition_id: (item as { variant?: { definition?: { id?: number | null } | null } }).variant?.definition?.id ?? null,
                        product_name: item.product_name,
                        variant_title: item.variant_title,
                        qty: item.qty,
                        supplier_price: String(item.supplier_price ?? ""),
                        supplier_sku: item.supplier_sku ?? "",
                    })),
                };

                setForm(nextForm);
                setReceiptStatus(receipt.status ?? null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить приход");
            } finally {
                setLoading(false);
            }
        };

        void loadReceipt();
    }, [isEdit, receiptId]);

    const submit = async () => {
        setSaving(true);
        setError("");

        try {
            if (!form.supplier_name.trim()) {
                throw new Error("Выберите поставщика");
            }
            if (!form.warehouse_id) {
                throw new Error("Выберите склад");
            }

            form.items.forEach((item, index) => {
                if (!item.product_id) {
                    throw new Error(`Строка ${index + 1}: выберите товар`);
                }

                if (!item.variant_id && !item.variant_definition_id) {
                    throw new Error(`Строка ${index + 1}: выберите вариант`);
                }

                if (!item.supplier_price || Number(item.supplier_price) < 0) {
                    throw new Error(`Строка ${index + 1}: укажите цену поставщика`);
                }
            });

            const payload: StockReceiptPayload = {
                warehouse_id: form.warehouse_id,
                supplier_id: form.supplier_id,
                supplier_code: form.supplier_code || null,
                supplier_name: form.supplier_name.trim(),
                received_at: form.received_at || null,
                comment: form.comment.trim(),
                items: form.items.map((item) => ({
                    product_id: Number(item.product_id),
                    variant_id: item.variant_id ? Number(item.variant_id) : null,
                    variant_definition_id: item.variant_definition_id ? Number(item.variant_definition_id) : null,
                    qty: Number(item.qty),
                    supplier_price: Number(item.supplier_price),
                    supplier_sku: item.supplier_sku.trim(),
                })),
            };

            if (isEdit && receiptId) {
                await updateStockReceipt(receiptId, payload);
                router.push("/admin/warehouse/receipts");
                return;
            }

            await createStockReceipt(payload);
            router.push("/admin/warehouse/receipts");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить приход");
        } finally {
            setSaving(false);
        }
    };

    const postReceipt = async () => {
        if (!isEdit || !receiptId) {
            return;
        }
        setPosting(true);
        setError("");
        try {
            const res = await postStockReceipt(receiptId);
            setReceiptStatus(res.data.status ?? STOCK_RECEIPT_STATUS.POSTED);
            setSuccessMessage(res.message || "Приход оприходован");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось провести приход");
        } finally {
            setPosting(false);
        }
    };

    const readOnlyPosted = isEdit && receiptStatus === STOCK_RECEIPT_STATUS.POSTED;

    const addDraftItem = () => {
        if (!draftItem.product_id) {
            setError("Выберите товар");
            return;
        }

        if (!draftItem.variant_definition_id) {
            setError("Выберите вариант");
            return;
        }

        if (!draftItem.supplier_price || Number(draftItem.supplier_price) < 0) {
            setError("Укажите цену");
            return;
        }

        setError("");
        setForm((prev) => ({
            ...prev,
            items: [
                ...prev.items.filter((item) => item.product_id !== null),
                {
                    product_id: draftItem.product_id,
                    variant_id: null,
                    variant_definition_id: draftItem.variant_definition_id,
                    product_name: draftItem.product_query,
                    variant_title: draftItem.variant_query,
                    qty: draftItem.qty,
                    supplier_price: draftItem.supplier_price,
                    supplier_sku: draftItem.supplier_sku,
                },
            ],
        }));
        setDraftItem(emptyDraftItem());
        setVariantOptions([]);
        setProductOptions([]);
        setIsAddModalOpen(false);
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Склад", href: "/admin/warehouse/receipts" },
                    { label: "Приходы", href: "/admin/warehouse/receipts" },
                    { label: isEdit ? "Редактирование" : "Новый приход" },
                ]}
            />

            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                        {isEdit ? `Редактировать приход #${receiptId}` : "Новый приход"}
                    </h1>
                    {isEdit && receiptStatus ? (
                        <p className="mt-1 text-sm font-medium text-slate-700">
                            Статус: {getStockReceiptStatusLabel(receiptStatus)}
                        </p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-600">
                        Сначала сохраняется черновик; проведение (оприходование) переносит товар на склад и обновляет цены.
                        Отмена проводки пока недоступна.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                        href="/admin/warehouse/receipts"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Назад
                    </Link>
                    {isEdit && receiptStatus === STOCK_RECEIPT_STATUS.DRAFT ? (
                        <button
                            type="button"
                            onClick={() => void postReceipt()}
                            disabled={posting || loading || saving}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-700 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                        >
                            {posting ? "Проводим..." : "Провести оприходование"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={
                            saving ||
                            loading ||
                            (isEdit && receiptStatus === STOCK_RECEIPT_STATUS.POSTED)
                        }
                        className="inline-flex h-10 items-center justify-center rounded-full bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60"
                    >
                        {saving ? "Сохраняем..." : "Сохранить черновик"}
                    </button>
                </div>
            </div>

            {successMessage ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="success"
                        message={successMessage}
                        onCloseAction={() => setSuccessMessage("")}
                    />
                </div>
            ) : null}

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка прихода..." />
            ) : (
                <div className="space-y-4">
                    <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card p-3 shadow-sm sm:p-4">
                        <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
                            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm">
                                <span className="text-slate-600">Склад</span>
                                <select
                                    value={form.warehouse_id ?? ""}
                                    disabled={readOnlyPosted}
                                    onChange={(e) => setForm((prev) => ({ ...prev, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
                                    className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:bg-white disabled:opacity-60"
                                >
                                    <option value="">Выберите склад</option>
                                    {warehouses.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm">
                                <span className="text-slate-600">Поставщик</span>
                                <select
                                    value={form.supplier_id ?? ""}
                                    disabled={readOnlyPosted}
                                    onChange={(e) => {
                                        const supplierId = e.target.value ? Number(e.target.value) : null;
                                        const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
                                        setForm((prev) => ({
                                            ...prev,
                                            supplier_id: supplierId,
                                            supplier_code: supplier?.code ?? "",
                                            supplier_name: supplier?.name ?? "",
                                        }));
                                    }}
                                    className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:bg-white disabled:opacity-60"
                                >
                                    <option value="">Выберите поставщика</option>
                                    {suppliers.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm xl:w-[260px] xl:min-w-[260px] xl:shrink-0">
                                <span className="text-slate-600">Дата прихода</span>
                                <input
                                    type="datetime-local"
                                    value={form.received_at}
                                    disabled={readOnlyPosted}
                                    onChange={(e) => setForm((prev) => ({ ...prev, received_at: e.target.value }))}
                                    className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:bg-white disabled:opacity-60"
                                />
                            </label>
                        </div>

                        <label className="mt-3 flex flex-col gap-1 text-sm">
                            <span className="text-slate-600">Комментарий</span>
                            <textarea
                                value={form.comment}
                                disabled={readOnlyPosted}
                                onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                                className="min-h-16 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:bg-white disabled:opacity-60"
                                placeholder="Комментарий к приходу"
                            />
                        </label>
                    </div>

                    <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">Документ</div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(true)}
                                disabled={readOnlyPosted}
                                className="inline-flex h-10 items-center justify-center rounded-full bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60"
                            >
                                Добавить товар
                            </button>
                        </div>

                        <div className="p-3 sm:p-4">
                            {form.items.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                                    Пока нет строк. Добавь товар, вариант, код, количество и цену.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {form.items.map((item, index) => (
                                        <div
                                            key={`${item.product_id}-${item.variant_definition_id}-${index}`}
                                            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <span className="font-medium">{item.supplier_sku || "Без кода"}</span>
                                                <span className="mx-2 text-slate-300">-</span>
                                                <span>{item.product_name}</span>
                                                <span className="mx-2 text-slate-300">/</span>
                                                <span>{item.variant_title}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <span>{item.qty} шт.</span>
                                                <span>{item.supplier_price}</span>
                                                <button
                                                    type="button"
                                                    disabled={readOnlyPosted}
                                                    onClick={() =>
                                                        setForm((prev) => ({
                                                            ...prev,
                                                            items: prev.items.filter((_, rowIndex) => rowIndex !== index),
                                                        }))
                                                    }
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isAddModalOpen ? (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
                    onClick={() => setIsAddModalOpen(false)}
                    role="presentation"
                >
                    <div
                        className="w-full max-w-3xl rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">Добавить товар</h2>
                                <p className="mt-1 text-sm text-slate-500">Выбери товар, вариант и добавь строку в документ.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-3 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="min-w-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Товар
                                    </label>
                                    <div className="relative">
                                        <input
                                            value={draftItem.product_query}
                                            onChange={(e) => {
                                                const nextQuery = e.target.value;
                                                setDraftItem((prev) => ({
                                                    ...prev,
                                                    product_query: nextQuery,
                                                    product_id: null,
                                                }));
                                                void loadProducts(nextQuery);
                                            }}
                                            className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 pr-10 text-sm shadow-sm outline-none transition focus:border-slate-300"
                                            placeholder="Начните вводить название товара"
                                        />
                                        {draftItem.product_query ? (
                                            <button
                                                type="button"
                                                onClick={() => setDraftItem((prev) => ({ ...prev, product_query: "", product_id: null }))}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                ×
                                            </button>
                                        ) : null}
                                    </div>

                                    {draftItem.product_id == null && draftItem.product_query.trim() !== "" ? (
                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {productOptions
                                                .filter((product) => product.name.toLowerCase().includes(draftItem.product_query.toLowerCase()))
                                                .slice(0, 8)
                                                .map((product) => (
                                                    <button
                                                        key={product.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setDraftItem((prev) => ({
                                                                ...prev,
                                                                product_id: product.id,
                                                                product_query: product.name,
                                                            }));
                                                        }}
                                                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                                                    >
                                                        {product.name}
                                                    </button>
                                                ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="min-w-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Вариант
                                    </label>
                                    <input
                                        value={draftItem.variant_query}
                                        onChange={(e) => {
                                            const nextQuery = e.target.value;
                                            setDraftItem((prev) => ({
                                                ...prev,
                                                variant_query: nextQuery,
                                                variant_definition_id: null,
                                            }));
                                            void loadVariantDefinitions(nextQuery);
                                        }}
                                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-300"
                                        placeholder="Поиск варианта"
                                    />

                                    {draftItem.variant_query.trim() !== "" && variantOptions.length > 0 ? (
                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {variantOptions.slice(0, 12).map((definition) => (
                                                <button
                                                    key={definition.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftItem((prev) => ({
                                                            ...prev,
                                                            variant_definition_id: definition.id,
                                                            variant_query: definition.title,
                                                        }));
                                                        setVariantOptions([]);
                                                    }}
                                                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                                                >
                                                    <span className="min-w-0 truncate">{definition.title}</span>
                                                    <span className="ml-3 shrink-0 text-[11px] text-slate-500">вариант</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex flex-nowrap items-end gap-3">
                                <div className="min-w-0 flex-1">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Код
                                    </label>
                                    <input
                                        value={draftItem.supplier_sku}
                                        onChange={(e) => setDraftItem((prev) => ({ ...prev, supplier_sku: e.target.value }))}
                                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-300"
                                    />
                                </div>
                                <div className="w-[110px] min-w-[110px] shrink-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Кол-во
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={draftItem.qty}
                                        onChange={(e) => setDraftItem((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value || 1)) }))}
                                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-300"
                                    />
                                </div>
                                <div className="w-[120px] min-w-[120px] shrink-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Цена
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={draftItem.supplier_price}
                                        onChange={(e) => setDraftItem((prev) => ({ ...prev, supplier_price: e.target.value }))}
                                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-300"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={addDraftItem}
                                className="inline-flex h-10 items-center justify-center rounded-full bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover"
                            >
                                Добавить
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}
