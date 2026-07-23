"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    createStockReceipt,
    fetchStockReceipt,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    lookupStockReceiptBySku,
    postStockReceipt,
    updateStockReceipt,
    type StockReceiptPayload,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import { STOCK_RECEIPT_STATUS, getStockReceiptStatusLabel } from "@/lib/warehouse-document-status";
import {
    fetchProductById,
    flattenProductSmartSearchHits,
    smartSearchProductsWithFallback,
    type ProductSmartSearchItem,
    type ProductSmartSearchVariantPreview,
} from "@/lib/admin-products-api";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";

type ReceiptFormItem = {
    product_id: number | null;
    variant_id: number | null;
    variant_definition_id: number | null;
    product_name: string;
    variant_title: string;
    qty: number;
    supplier_price: string;
    supplier_sku: string;
    supplier_product_name: string;
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
    variant_id: number | null;
    product_query: string;
    product_name: string;
    variant_title: string;
    qty: number;
    supplier_price: string;
    supplier_sku: string;
    supplier_product_name: string;
};

const emptyDraftItem = (): DraftReceiptItem => ({
    product_id: null,
    variant_id: null,
    product_query: "",
    product_name: "",
    variant_title: "",
    qty: 1,
    supplier_price: "",
    supplier_sku: "",
    supplier_product_name: "",
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
    const [productHits, setProductHits] = useState<ProductSmartSearchItem[]>([]);
    const [productHitsLoading, setProductHitsLoading] = useState(false);
    const [pickingProduct, setPickingProduct] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [receiptStatus, setReceiptStatus] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState("");
    const [skuLookupPending, setSkuLookupPending] = useState(false);
    const supplierProductNameTouchedRef = useRef(false);
    const debouncedSupplierSku = useDebouncedValue(draftItem.supplier_sku, 350);
    const debouncedProductQuery = useDebouncedValue(draftItem.product_query, 350);

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
    }, []);

    useEffect(() => {
        if (!isAddModalOpen) {
            setProductHits([]);
            setProductHitsLoading(false);
            return;
        }

        const query = debouncedProductQuery.trim();
        if (query.length < 2 || draftItem.product_id != null) {
            setProductHits([]);
            setProductHitsLoading(false);
            return;
        }

        let cancelled = false;
        setProductHitsLoading(true);

        void smartSearchProductsWithFallback({ q: query, limit: 12 })
            .then((response) => {
                if (!cancelled) {
                    setProductHits(response.data ?? []);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setProductHits([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setProductHitsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedProductQuery, draftItem.product_id, isAddModalOpen]);

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
                    items: (receipt.items ?? []).map((item) => {
                        const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
                        const supplierProductName = String(
                            (payload as { supplier_product_name?: unknown }).supplier_product_name
                                ?? (payload as { title?: unknown }).title
                                ?? (payload as { name?: unknown }).name
                                ?? "",
                        );

                        return {
                            product_id: item.product_id,
                            variant_id: item.variant_id ?? null,
                            variant_definition_id: (item as { variant?: { definition?: { id?: number | null } | null } }).variant?.definition?.id ?? null,
                            product_name: item.product_name,
                            variant_title: item.variant_title,
                            qty: item.qty,
                            supplier_price: String(item.supplier_price ?? ""),
                            supplier_sku: item.supplier_sku ?? "",
                            supplier_product_name: supplierProductName,
                        };
                    }),
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

    useEffect(() => {
        const code = debouncedSupplierSku.trim();
        if (!isAddModalOpen || code === "") {
            setSkuLookupPending(false);
            return;
        }

        let cancelled = false;
        setSkuLookupPending(true);

        void lookupStockReceiptBySku({
            code,
            supplier_id: form.supplier_id,
        })
            .then((response) => {
                if (cancelled) {
                    return;
                }

                const foundName = (response.data?.supplier_product_name ?? "").trim();
                const foundPrice = response.data?.supplier_price;

                setDraftItem((prev) => {
                    if (prev.supplier_sku.trim() !== code) {
                        return prev;
                    }

                    const next = { ...prev };
                    if (foundName !== "" && !supplierProductNameTouchedRef.current) {
                        next.supplier_product_name = foundName;
                    }
                    if (
                        (prev.supplier_price.trim() === "" || Number(prev.supplier_price) <= 0)
                        && foundPrice != null
                        && String(foundPrice).trim() !== ""
                    ) {
                        next.supplier_price = String(foundPrice);
                    }
                    return next;
                });
            })
            .catch(() => {
                // Lookup is best-effort: leave fields for manual input.
            })
            .finally(() => {
                if (!cancelled) {
                    setSkuLookupPending(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedSupplierSku, form.supplier_id, isAddModalOpen]);

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
                    payload: item.supplier_product_name.trim()
                        ? { supplier_product_name: item.supplier_product_name.trim() }
                        : undefined,
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
        if (!draftItem.product_id || !draftItem.variant_id) {
            setError("Выберите товар и вариант из поиска");
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
                    variant_id: draftItem.variant_id,
                    variant_definition_id: null,
                    product_name: draftItem.product_name,
                    variant_title: draftItem.variant_title,
                    qty: draftItem.qty,
                    supplier_price: draftItem.supplier_price,
                    supplier_sku: draftItem.supplier_sku,
                    supplier_product_name: draftItem.supplier_product_name.trim(),
                },
            ],
        }));
        supplierProductNameTouchedRef.current = false;
        setDraftItem(emptyDraftItem());
        setProductHits([]);
        setIsAddModalOpen(false);
    };

    const pickProductVariant = async (
        hit: ProductSmartSearchItem,
        variantPreview: ProductSmartSearchVariantPreview,
    ) => {
        setPickingProduct(true);
        setError("");
        try {
            const response = await fetchProductById(hit.id);
            const detail = response.data;
            const variantId = variantPreview.id;
            const variant =
                (variantId != null ? detail.variants?.find((item) => item.id === variantId) : undefined)
                ?? detail.variants?.find(
                    (item) => (item.title || item.display_name || "").trim() === variantPreview.title.trim(),
                );

            if (!variant) {
                setError("Вариант не найден — попробуйте другой результат поиска");
                return;
            }

            const label = `${detail.id} — ${[hit.brand_name, detail.name].filter(Boolean).join(" ")} ${variant.title || variant.display_name || variantPreview.title}`.trim();

            setDraftItem((prev) => ({
                ...prev,
                product_id: detail.id,
                variant_id: variant.id,
                product_name: detail.name,
                variant_title: variant.title || variant.display_name || variantPreview.title,
                product_query: label,
            }));
            setProductHits([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось выбрать товар");
        } finally {
            setPickingProduct(false);
        }
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

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Link
                        href="/admin/warehouse/receipts"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-admin-border bg-admin-surface px-4 text-sm font-medium text-admin-text hover:bg-admin-muted sm:w-auto"
                    >
                        Назад
                    </Link>
                    {isEdit && receiptStatus === STOCK_RECEIPT_STATUS.DRAFT ? (
                        <button
                            type="button"
                            onClick={() => void postReceipt()}
                            disabled={posting || loading || saving}
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-emerald-700 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 sm:w-auto"
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
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60 sm:w-auto"
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
                                    className="h-10 rounded-lg border border-admin-border bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white disabled:opacity-60"
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
                                    className="h-10 rounded-lg border border-admin-border bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white disabled:opacity-60"
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
                                    className="h-10 rounded-lg border border-admin-border bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white disabled:opacity-60"
                                />
                            </label>
                        </div>

                        <label className="mt-3 flex flex-col gap-1 text-sm">
                            <span className="text-slate-600">Комментарий</span>
                            <textarea
                                value={form.comment}
                                disabled={readOnlyPosted}
                                onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                                className="min-h-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white disabled:opacity-60"
                                placeholder="Комментарий к приходу"
                            />
                        </label>
                    </div>

                    <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">Документ</div>
                            <button
                                type="button"
                                onClick={() => {
                                    supplierProductNameTouchedRef.current = false;
                                    setDraftItem(emptyDraftItem());
                                    setProductHits([]);
                                    setIsAddModalOpen(true);
                                }}
                                disabled={readOnlyPosted}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60"
                            >
                                Добавить товар
                            </button>
                        </div>

                        <div className="p-3 sm:p-4">
                            {form.items.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                                    Пока нет строк. Добавь товар с вариантом, код, название у поставщика, количество и цену.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {form.items.map((item, index) => (
                                        <div
                                            key={`${item.product_id}-${item.variant_id ?? item.variant_definition_id}-${index}`}
                                            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <span className="font-medium">{item.supplier_sku || "Без кода"}</span>
                                                <span className="mx-2 text-slate-300">-</span>
                                                <span>{item.product_name}</span>
                                                <span className="mx-2 text-slate-300">/</span>
                                                <span>{item.variant_title}</span>
                                                {item.supplier_product_name ? (
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        У поставщика: {item.supplier_product_name}
                                                    </div>
                                                ) : null}
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
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-3 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="min-w-0 flex-1">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Товар и вариант
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
                                                    variant_id: null,
                                                    product_name: "",
                                                    variant_title: "",
                                                }));
                                            }}
                                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 pr-10 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                            placeholder="Название, бренд или артикул"
                                        />
                                        {draftItem.product_query ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDraftItem((prev) => ({
                                                        ...prev,
                                                        product_query: "",
                                                        product_id: null,
                                                        variant_id: null,
                                                        product_name: "",
                                                        variant_title: "",
                                                    }));
                                                    setProductHits([]);
                                                }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                ×
                                            </button>
                                        ) : null}
                                    </div>

                                    {draftItem.product_id == null
                                    && (productHitsLoading
                                        || pickingProduct
                                        || productHits.length > 0
                                        || debouncedProductQuery.trim().length >= 2) ? (
                                        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {productHitsLoading || pickingProduct ? (
                                                <div className="px-3 py-2 text-xs text-slate-500">Поиск…</div>
                                            ) : flattenProductSmartSearchHits(productHits).length === 0 ? (
                                                <div className="px-3 py-2 text-xs text-slate-500">Ничего не найдено</div>
                                            ) : (
                                                flattenProductSmartSearchHits(productHits).map((option) => {
                                                    const hit = option.hit;
                                                    const q = draftItem.product_query;
                                                    const productLabel = [hit.brand_name, hit.name].filter(Boolean).join(" ");

                                                    if (option.kind === "no-variants") {
                                                        return (
                                                            <div
                                                                key={option.key}
                                                                className="border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-500 last:border-b-0"
                                                            >
                                                                <span className="tabular-nums text-slate-400">
                                                                    {highlightAdminSearchTerms(String(hit.id), q)}
                                                                </span>
                                                                <span className="text-slate-300"> — </span>
                                                                <span>{highlightAdminSearchTerms(productLabel || "—", q, hit.brand_name)}</span>
                                                                <span className="text-slate-400"> — нет вариантов</span>
                                                            </div>
                                                        );
                                                    }

                                                    const variant = option.variant;
                                                    return (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => void pickProductVariant(hit, variant)}
                                                            className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                                                        >
                                                            <span className="tabular-nums text-slate-400">
                                                                {highlightAdminSearchTerms(String(hit.id), q)}
                                                            </span>
                                                            <span className="text-slate-300"> — </span>
                                                            <span className="font-medium text-slate-900">
                                                                {highlightAdminSearchTerms(productLabel || "—", q, hit.brand_name)}
                                                            </span>
                                                            <span className="text-slate-300"> </span>
                                                            <span className="text-slate-700">
                                                                {highlightAdminSearchTerms(variant.title, q, hit.brand_name)}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="flex shrink-0 gap-3">
                                    <div className="w-[88px] min-w-[88px]">
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                            Кол-во
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={draftItem.qty}
                                            onChange={(e) => setDraftItem((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value || 1)) }))}
                                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                        />
                                    </div>
                                    <div className="w-[104px] min-w-[104px]">
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                            Цена
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={draftItem.supplier_price}
                                            onChange={(e) => setDraftItem((prev) => ({ ...prev, supplier_price: e.target.value }))}
                                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-end gap-3">
                                <div className="w-[7.25rem] shrink-0 sm:w-32">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Код поставщика
                                    </label>
                                    <input
                                        value={draftItem.supplier_sku}
                                        onChange={(e) => {
                                            supplierProductNameTouchedRef.current = false;
                                            setDraftItem((prev) => ({ ...prev, supplier_sku: e.target.value }));
                                        }}
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Название у поставщика
                                        {skuLookupPending ? (
                                            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                                                поиск…
                                            </span>
                                        ) : null}
                                    </label>
                                    <input
                                        value={draftItem.supplier_product_name}
                                        onChange={(e) => {
                                            supplierProductNameTouchedRef.current = true;
                                            setDraftItem((prev) => ({
                                                ...prev,
                                                supplier_product_name: e.target.value,
                                            }));
                                        }}
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                        placeholder="Подставится по коду или вручную"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={addDraftItem}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover"
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
