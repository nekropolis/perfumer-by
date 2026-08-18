"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    createStockReceipt,
    fetchStockReceipt,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    importStockReceiptSupplierXlsx,
    lookupStockReceiptBySku,
    postAndDistributeStockReceipt,
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
import { adminIconBtn, adminInput } from "@/lib/admin-ui-classes";

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
    line_comment: string;
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
    line_comment: string;
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
    line_comment: "",
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
    const [distributing, setDistributing] = useState(false);
    const [importingXlsx, setImportingXlsx] = useState(false);
    const [error, setError] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
    const [receiptStatus, setReceiptStatus] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState("");
    const [skuLookupPending, setSkuLookupPending] = useState(false);
    const supplierProductNameTouchedRef = useRef(false);
    const xlsxInputRef = useRef<HTMLInputElement | null>(null);
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
                        const lineComment = String((payload as { comment?: unknown }).comment ?? "");

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
                            line_comment: lineComment,
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

    const buildReceiptPayload = (): StockReceiptPayload => {
        if (!form.supplier_id || !form.supplier_name.trim()) {
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

        return {
            warehouse_id: form.warehouse_id,
            supplier_id: form.supplier_id,
            supplier_code: form.supplier_code || null,
            supplier_name: form.supplier_name.trim(),
            received_at: form.received_at || null,
            comment: form.comment.trim(),
            items: form.items.map((item) => {
                const payloadBody: NonNullable<StockReceiptPayload["items"][number]["payload"]> = {};
                const supplierName = item.supplier_product_name.trim();
                const lineComment = item.line_comment.trim();
                if (supplierName) {
                    payloadBody.supplier_product_name = supplierName;
                }
                if (lineComment) {
                    payloadBody.comment = lineComment;
                }
                return {
                    product_id: Number(item.product_id),
                    variant_id: item.variant_id ? Number(item.variant_id) : null,
                    variant_definition_id: item.variant_definition_id ? Number(item.variant_definition_id) : null,
                    qty: Number(item.qty),
                    supplier_price: Number(item.supplier_price),
                    supplier_sku: item.supplier_sku.trim(),
                    payload: Object.keys(payloadBody).length > 0 ? payloadBody : undefined,
                };
            }),
        };
    };

    const persistDraft = async (receiptIdToSave: number) => {
        await updateStockReceipt(receiptIdToSave, buildReceiptPayload());
    };

    const submit = async () => {
        setSaving(true);
        setError("");

        try {
            const payload = buildReceiptPayload();

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
            await persistDraft(receiptId);
            const res = await postStockReceipt(receiptId);
            setReceiptStatus(res.data.status ?? STOCK_RECEIPT_STATUS.POSTED);
            setSuccessMessage(res.message || "Приход оприходован");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось провести приход");
        } finally {
            setPosting(false);
        }
    };

    const postAndDistributeReceipt = async () => {
        if (!isEdit || !receiptId) {
            return;
        }
        setDistributing(true);
        setError("");
        try {
            if (receiptStatus === STOCK_RECEIPT_STATUS.DRAFT) {
                await persistDraft(receiptId);
            }
            const res = await postAndDistributeStockReceipt(receiptId);
            setReceiptStatus(res.data.status ?? STOCK_RECEIPT_STATUS.POSTED);
            const distributed = typeof res.distributed_items === "number" ? res.distributed_items : 0;
            const updatedOrders = typeof res.updated_orders === "number" ? res.updated_orders : 0;
            const statusChanged = typeof res.status_changed_orders === "number" ? res.status_changed_orders : 0;
            setSuccessMessage(
                res.message
                    || `Приход разнесён и оприходован. Позиций: ${distributed}, заказов: ${updatedOrders}, статусов «На складе»: ${statusChanged}`,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось разнести и провести приход");
        } finally {
            setDistributing(false);
        }
    };

    const importSupplierXlsx = async (file: File) => {
        if (!form.supplier_id) {
            setError("Сначала выберите поставщика");
            return;
        }
        setImportingXlsx(true);
        setError("");
        try {
            const res = await importStockReceiptSupplierXlsx({
                file,
                supplier_id: form.supplier_id,
                warehouse_id: form.warehouse_id,
                supplier_code: form.supplier_code || null,
                supplier_name: form.supplier_name || null,
                received_at: form.received_at || null,
                comment: form.comment.trim() || null,
            });
            const createdId = res.data?.id;
            if (!createdId) {
                throw new Error("Не получен id черновика прихода");
            }
            router.replace(`/admin/warehouse/receipts/${createdId}/edit`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить XLSX");
        } finally {
            setImportingXlsx(false);
            if (xlsxInputRef.current) {
                xlsxInputRef.current.value = "";
            }
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

        const nextItem: ReceiptFormItem = {
            product_id: draftItem.product_id,
            variant_id: draftItem.variant_id,
            variant_definition_id: null,
            product_name: draftItem.product_name,
            variant_title: draftItem.variant_title,
            qty: draftItem.qty,
            supplier_price: draftItem.supplier_price,
            supplier_sku: draftItem.supplier_sku,
            supplier_product_name: draftItem.supplier_product_name.trim(),
            line_comment: draftItem.line_comment.trim(),
        };

        setError("");
        setForm((prev) => {
            if (editingItemIndex !== null) {
                const items = [...prev.items];
                items[editingItemIndex] = nextItem;
                return { ...prev, items };
            }

            return {
                ...prev,
                items: [...prev.items.filter((item) => item.product_id !== null), nextItem],
            };
        });
        supplierProductNameTouchedRef.current = false;
        setDraftItem(emptyDraftItem());
        setProductHits([]);
        setEditingItemIndex(null);
        setIsAddModalOpen(false);
    };

    const openAddItemModal = () => {
        if (!form.supplier_id) {
            setError("Сначала выберите поставщика");
            return;
        }
        supplierProductNameTouchedRef.current = false;
        setEditingItemIndex(null);
        setDraftItem(emptyDraftItem());
        setProductHits([]);
        setIsAddModalOpen(true);
    };

    const openEditItemModal = (index: number) => {
        if (readOnlyPosted) {
            return;
        }
        const item = form.items[index];
        if (!item?.product_id || !item.variant_id) {
            return;
        }

        supplierProductNameTouchedRef.current = Boolean(item.supplier_product_name.trim());
        setEditingItemIndex(index);
        setDraftItem({
            product_id: item.product_id,
            variant_id: item.variant_id,
            product_query: `${item.product_id} — ${item.product_name} ${item.variant_title}`.trim(),
            product_name: item.product_name,
            variant_title: item.variant_title,
            qty: item.qty,
            supplier_price: item.supplier_price,
            supplier_sku: item.supplier_sku,
            supplier_product_name: item.supplier_product_name,
            line_comment: item.line_comment,
        });
        setProductHits([]);
        setIsAddModalOpen(true);
    };

    const closeItemModal = () => {
        setIsAddModalOpen(false);
        setEditingItemIndex(null);
        setDraftItem(emptyDraftItem());
        setProductHits([]);
        supplierProductNameTouchedRef.current = false;
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

            const productName = [hit.brand_name, detail.name].filter(Boolean).join(" ").trim() || detail.name;
            const variantTitle = variant.title || variant.display_name || variantPreview.title;

            setDraftItem((prev) => ({
                ...prev,
                product_id: detail.id,
                variant_id: variant.id,
                product_name: productName,
                variant_title: variantTitle,
                product_query: `${detail.id} — ${productName} ${variantTitle}`.trim(),
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
                    <div className="flex items-start gap-3">
                        <Link
                            href="/admin/warehouse/receipts"
                            className={`${adminIconBtn} mt-0.5`}
                            aria-label="Назад к списку приходов"
                            title="Назад"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden />
                        </Link>
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
                    </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {isEdit && receiptStatus === STOCK_RECEIPT_STATUS.DRAFT ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void postAndDistributeReceipt()}
                                disabled={posting || distributing || loading || saving}
                                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-sky-700 bg-sky-50 px-4 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-60 sm:w-auto"
                            >
                                {distributing ? "Разносим..." : "Разнести и провести"}
                            </button>
                            <button
                                type="button"
                                onClick={() => void postReceipt()}
                                disabled={posting || distributing || loading || saving}
                                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-emerald-700 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 sm:w-auto"
                            >
                                {posting ? "Проводим..." : "Провести оприходование"}
                            </button>
                        </>
                    ) : null}
                    {isEdit && receiptStatus === STOCK_RECEIPT_STATUS.POSTED ? (
                        <button
                            type="button"
                            onClick={() => void postAndDistributeReceipt()}
                            disabled={distributing || loading}
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-sky-700 bg-sky-50 px-4 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-60 sm:w-auto"
                        >
                            {distributing ? "Разносим..." : "Разнести по заказам"}
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
                            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm">
                                <span className="font-medium text-admin-text-secondary">Склад</span>
                                <AdminStatusDropdown
                                    value={form.warehouse_id != null ? String(form.warehouse_id) : ""}
                                    onChangeAction={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            warehouse_id: value ? Number(value) : null,
                                        }))
                                    }
                                    options={warehouses.map((item) => ({
                                        value: String(item.id),
                                        label: item.name,
                                    }))}
                                    widthClassName="w-full"
                                    menuWidthClassName="w-max"
                                    disabled={readOnlyPosted}
                                />
                            </div>
                            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm">
                                <span className="font-medium text-admin-text-secondary">
                                    Поставщик <span className="text-red-600">*</span>
                                </span>
                                <AdminStatusDropdown
                                    value={form.supplier_id != null ? String(form.supplier_id) : ""}
                                    onChangeAction={(value) => {
                                        const supplierId = value ? Number(value) : null;
                                        const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
                                        setForm((prev) => ({
                                            ...prev,
                                            supplier_id: supplierId,
                                            supplier_code: supplier?.code ?? "",
                                            supplier_name: supplier?.name ?? "",
                                        }));
                                    }}
                                    options={suppliers.map((item) => ({
                                        value: String(item.id),
                                        label: item.name,
                                    }))}
                                    placeholder="Выберите поставщика"
                                    widthClassName="w-full"
                                    menuWidthClassName="w-max"
                                    disabled={readOnlyPosted}
                                />
                            </div>

                            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm xl:w-[260px] xl:min-w-[260px] xl:shrink-0">
                                <span className="font-medium text-admin-text-secondary">Дата прихода</span>
                                <input
                                    type="datetime-local"
                                    value={form.received_at}
                                    disabled={readOnlyPosted}
                                    onChange={(e) => setForm((prev) => ({ ...prev, received_at: e.target.value }))}
                                    className={`${adminInput} disabled:cursor-not-allowed disabled:opacity-60`}
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
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <input
                                    ref={xlsxInputRef}
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            void importSupplierXlsx(file);
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!form.supplier_id) {
                                            setError("Сначала выберите поставщика");
                                            return;
                                        }
                                        xlsxInputRef.current?.click();
                                    }}
                                    disabled={readOnlyPosted || importingXlsx || isEdit || !form.supplier_id}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-admin-border bg-admin-surface px-4 text-sm font-medium text-admin-text hover:bg-admin-muted disabled:opacity-60"
                                    title={
                                        !form.supplier_id
                                            ? "Сначала выберите поставщика"
                                            : isEdit
                                              ? "Загрузка XLSX доступна при создании нового прихода"
                                              : undefined
                                    }
                                >
                                    {importingXlsx ? "Загружаем..." : "Приход XLSX"}
                                </button>
                                <button
                                    type="button"
                                    onClick={openAddItemModal}
                                    disabled={readOnlyPosted}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60"
                                >
                                    Добавить товар
                                </button>
                            </div>
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
                                            className="flex flex-col gap-2 overflow-visible rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-start md:justify-between"
                                        >
                                            <div className="min-w-0 flex-1 break-words">
                                                <div className="font-medium text-slate-900">
                                                    <span>{item.product_name}</span>
                                                    {item.variant_title ? (
                                                        <>
                                                            <span className="mx-2 font-normal text-slate-300">/</span>
                                                            <span>{item.variant_title}</span>
                                                        </>
                                                    ) : null}
                                                </div>
                                                {item.supplier_sku || item.supplier_product_name ? (
                                                    <div className="mt-1 text-xs leading-snug text-slate-500">
                                                        У поставщика:{" "}
                                                        {[item.supplier_sku, item.supplier_product_name]
                                                            .filter(Boolean)
                                                            .join(" — ")}
                                                    </div>
                                                ) : null}
                                                {item.line_comment ? (
                                                    <div className="mt-1 text-xs leading-snug text-slate-500">
                                                        Комментарий: {item.line_comment}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2 text-sm">
                                                <span className="tabular-nums">{item.qty} шт.</span>
                                                <span className="tabular-nums">{item.supplier_price}</span>
                                                <button
                                                    type="button"
                                                    disabled={readOnlyPosted}
                                                    title="Редактировать"
                                                    onClick={() => openEditItemModal(index)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={readOnlyPosted}
                                                    title="Удалить"
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
                    role="presentation"
                >
                    <div
                        className="w-full max-w-3xl rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">
                                    {editingItemIndex !== null ? "Редактировать товар" : "Добавить товар"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeItemModal}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-3 p-4">
                            <div className="w-full min-w-0">
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Товар и вариант
                                </label>
                                {draftItem.product_id != null ? (
                                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
                                        <div className="min-w-0 flex-1 break-words text-sm leading-snug text-slate-900">
                                            <span className="tabular-nums text-slate-500">
                                                {draftItem.product_id}
                                            </span>
                                            <span className="text-slate-400"> — </span>
                                            <span className="font-medium">{draftItem.product_name}</span>
                                            {draftItem.variant_title ? (
                                                <>
                                                    <span className="text-slate-400"> / </span>
                                                    <span>{draftItem.variant_title}</span>
                                                </>
                                            ) : null}
                                        </div>
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
                                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
                                        >
                                            Сменить
                                        </button>
                                    </div>
                                ) : (
                                    <>
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

                                        {productHitsLoading
                                        || pickingProduct
                                        || productHits.length > 0
                                        || debouncedProductQuery.trim().length >= 2 ? (
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
                                    </>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="w-full sm:w-[88px] sm:min-w-[88px] sm:shrink-0">
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
                                <div className="w-full sm:w-[120px] sm:min-w-[120px] sm:shrink-0">
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
                                <div className="min-w-0 flex-1">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Комментарий к партии (необязательно)
                                    </label>
                                    <input
                                        value={draftItem.line_comment}
                                        onChange={(e) =>
                                            setDraftItem((prev) => ({ ...prev, line_comment: e.target.value }))
                                        }
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                        placeholder="Например: брак, акция, особая партия"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="w-full sm:w-32 sm:shrink-0">
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
                                onClick={closeItemModal}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={addDraftItem}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover"
                            >
                                {editingItemIndex !== null ? "Сохранить" : "Добавить"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}
