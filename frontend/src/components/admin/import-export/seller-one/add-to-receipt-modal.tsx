"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
    createStockReceipt,
    fetchStockReceipt,
    fetchStockReceipts,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    updateStockReceipt,
    type StockReceiptListItem,
    type StockReceiptPayload,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import { STOCK_RECEIPT_STATUS } from "@/lib/warehouse-document-status";
import { adminBtnPrimary, adminBtnSecondary, adminModalOverlay } from "@/lib/admin-ui-classes";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";
import { SELLER_ONE_SUPPLIER_CODE } from "./constants";

type Props = {
    row: SellerOneSupplierProductItem;
    onClose: () => void;
};

function buildLineItem(
    row: SellerOneSupplierProductItem,
    lineComment: string,
    supplierPrice: number,
): StockReceiptPayload["items"][number] {
    const variant = row.linked_variant!;
    const trimmedComment = lineComment.trim();
    return {
        product_id: variant.product_id,
        variant_id: variant.id,
        qty: 1,
        supplier_price: supplierPrice,
        supplier_sku: row.code || undefined,
        payload: {
            supplier_product_name: row.external_name || undefined,
            comment: trimmedComment || undefined,
        },
    };
}

function receiptToPayload(
    receipt: StockReceiptListItem,
    extraItems: StockReceiptPayload["items"],
): StockReceiptPayload {
    const existing = (receipt.items ?? []).map((item) => {
        const payload =
            item.payload && typeof item.payload === "object"
                ? (item.payload as StockReceiptPayload["items"][number]["payload"])
                : undefined;

        return {
            product_id: item.product_id,
            variant_id: item.variant_id,
            qty: item.qty,
            supplier_price: Number(item.supplier_price ?? 0),
            supplier_sku: item.supplier_sku ?? undefined,
            payload,
        };
    });

    return {
        warehouse_id: receipt.warehouse_id ?? null,
        supplier_id: receipt.supplier_id ?? null,
        supplier_code: receipt.supplier_code ?? null,
        supplier_name: receipt.supplier_name,
        received_at: receipt.received_at ?? null,
        comment: receipt.comment ?? undefined,
        items: [...existing, ...extraItems],
    };
}

export default function AddToReceiptModal({ row, onClose }: Props) {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [lineComment, setLineComment] = useState("");
    const [supplierPriceInput, setSupplierPriceInput] = useState(
        row.supplier_price != null ? String(row.supplier_price) : "",
    );
    const [supplier, setSupplier] = useState<WarehouseSupplierOption | null>(null);
    const [warehouse, setWarehouse] = useState<WarehouseOption | null>(null);
    const [drafts, setDrafts] = useState<StockReceiptListItem[]>([]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const [suppliersRes, warehousesRes] = await Promise.all([
                    fetchWarehouseSuppliers(),
                    fetchWarehouses(),
                ]);
                if (cancelled) {
                    return;
                }

                const foundSupplier =
                    suppliersRes.data.find((item) => item.code === SELLER_ONE_SUPPLIER_CODE) ?? null;
                if (!foundSupplier) {
                    setError(`Поставщик «${SELLER_ONE_SUPPLIER_CODE}» не найден`);
                    setLoading(false);
                    return;
                }
                setSupplier(foundSupplier);

                const defaultWarehouse =
                    warehousesRes.data.find((item) => item.is_default)
                    ?? warehousesRes.data[0]
                    ?? null;
                setWarehouse(defaultWarehouse);

                const draftsRes = await fetchStockReceipts({
                    supplier_id: foundSupplier.id,
                    status: STOCK_RECEIPT_STATUS.DRAFT,
                });
                if (cancelled) {
                    return;
                }
                setDrafts(draftsRes.data ?? []);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Не удалось загрузить черновики прихода");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, []);

    const openReceipt = (id: number) => {
        onClose();
        if (typeof window !== "undefined") {
            window.open(`/admin/warehouse/receipts/${id}/edit`, "_blank", "noopener,noreferrer");
        }
    };

    const createNew = async () => {
        if (!supplier || !row.linked_variant) {
            setError("Нет связанного варианта или поставщика");
            return;
        }
        if (!warehouse) {
            setError("Нет склада для нового прихода");
            return;
        }
        const supplierPrice = Number(supplierPriceInput);
        if (!Number.isFinite(supplierPrice) || supplierPrice < 0) {
            setError("Укажите корректную входную цену");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const res = await createStockReceipt({
                warehouse_id: warehouse.id,
                supplier_id: supplier.id,
                supplier_code: supplier.code,
                supplier_name: supplier.name,
                items: [buildLineItem(row, lineComment, supplierPrice)],
            });
            openReceipt(res.data.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось создать приход");
            setSubmitting(false);
        }
    };

    const addToExisting = async (draftId: number) => {
        if (!row.linked_variant) {
            setError("Нет связанного варианта");
            return;
        }
        const supplierPrice = Number(supplierPriceInput);
        if (!Number.isFinite(supplierPrice) || supplierPrice < 0) {
            setError("Укажите корректную входную цену");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const detail = await fetchStockReceipt(draftId);
            const receipt = detail.data;
            if (receipt.status !== STOCK_RECEIPT_STATUS.DRAFT) {
                setError("Приход уже не черновик");
                setSubmitting(false);
                return;
            }
            await updateStockReceipt(draftId, receiptToPayload(receipt, [buildLineItem(row, lineComment, supplierPrice)]));
            openReceipt(draftId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось добавить в приход");
            setSubmitting(false);
        }
    };

    const productLabel = [
        row.linked_variant?.brand_name,
        row.linked_variant?.display_name || row.linked_variant?.product_name,
        row.linked_variant?.display,
    ]
        .filter(Boolean)
        .join(" / ");

    if (!mounted) {
        return null;
    }

    return createPortal(
        <div className={adminModalOverlay} role="presentation" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-xl border border-admin-border bg-admin-surface shadow-admin-card"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">Добавить в приход</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Черновик · поставщик Seller One
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-3 px-4 py-3 text-sm">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="font-medium text-slate-900">{row.code || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-600">{row.external_name}</div>
                        {productLabel ? (
                            <div className="mt-1 text-xs text-slate-500">{productLabel}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-slate-500">Кол-во: 1</div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                            Входная цена
                        </label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={supplierPriceInput}
                            onChange={(e) => setSupplierPriceInput(e.target.value)}
                            placeholder="0.00"
                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                            Комментарий к товару (необязательно)
                        </label>
                        <input
                            value={lineComment}
                            onChange={(e) => setLineComment(e.target.value)}
                            placeholder="Например: примятая коробка"
                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                        />
                    </div>

                    {error ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {error}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="py-4 text-center text-xs text-slate-500">Загрузка черновиков…</div>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={submitting || !supplier}
                                onClick={() => void createNew()}
                                className={`${adminBtnPrimary} w-full disabled:opacity-60`}
                            >
                                Создать новый черновик прихода
                            </button>

                            <div>
                                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Или добавить к существующему
                                </div>
                                {drafts.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                                        Нет черновиков с этим поставщиком
                                    </div>
                                ) : (
                                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                                        {drafts.map((draft) => (
                                            <button
                                                key={draft.id}
                                                type="button"
                                                disabled={submitting}
                                                onClick={() => void addToExisting(draft.id)}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                            >
                                                <span className="whitespace-normal break-words">
                                                    <span className="font-medium text-slate-900">
                                                        {draft.document_no || draft.id}
                                                    </span>
                                                    {` ${draft.supplier_name}`}
                                                    {draft.warehouse?.name
                                                        ? ` · ${draft.warehouse.name}`
                                                        : ""}
                                                    {` · строк: ${draft.items?.length ?? 0} - Черновик`}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end border-t border-slate-200 px-4 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className={adminBtnSecondary}
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
