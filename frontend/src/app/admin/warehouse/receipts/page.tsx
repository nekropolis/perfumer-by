"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Pencil, Trash2 } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminInfoButton from "@/components/admin/ui/admin-info-button";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteStockReceipt,
    fetchStockReceipts,
    fetchWarehouses,
    getStockReceiptStatusLabel,
    postStockReceipt,
    type StockReceiptListItem,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";
import { STOCK_RECEIPT_STATUS } from "@/lib/warehouse-document-status";

function formatDate(value?: string | null): string {
    if (!value) {
        return "Не указана";
    }

    try {
        return new Date(value).toLocaleString("ru-RU");
    } catch {
        return value;
    }
}

function ReceiptDetailsModal({
    row,
    onCloseAction,
}: {
    row: StockReceiptListItem | null;
    onCloseAction: () => void;
}) {
    if (!row) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4" onClick={onCloseAction} role="presentation">
            <div
                className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold">Приход #{row.document_no ?? row.id}</h2>
                        <p className="mt-1 text-sm text-admin-text-secondary">
                            {row.supplier_name} · {formatDate(row.received_at)}
                        </p>
                    </div>
                    <button type="button" onClick={onCloseAction} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-lg text-admin-text-secondary hover:bg-admin-muted">
                        ×
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <div className="mb-4 rounded-xl bg-admin-muted px-4 py-3 text-sm text-admin-text">
                        {row.comment || "Комментарий не указан"}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-4 py-3">Товар</th>
                                    <th className="px-4 py-3">Вариант</th>
                                    <th className="px-4 py-3">Кол-во</th>
                                    <th className="px-4 py-3">Цена</th>
                                    <th className="px-4 py-3">Сумма</th>
                                    <th className="px-4 py-3">Код</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(row.items ?? []).map((item) => (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3">{item.product_name}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text">{item.variant_title}</td>
                                        <td className="px-4 py-3">{item.qty}</td>
                                        <td className="px-4 py-3">{item.supplier_price}</td>
                                        <td className="px-4 py-3">{item.line_total ?? "—"}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.supplier_sku || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AdminWarehouseReceiptsPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<StockReceiptListItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useUrlPage();
    const [search, setSearch] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [deleteTarget, setDeleteTarget] = useState<StockReceiptListItem | null>(null);
    const [detailRow, setDetailRow] = useState<StockReceiptListItem | null>(null);
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [postingId, setPostingId] = useState<number | null>(null);

    const debouncedSearch = useDebouncedValue(search, 350);

    const loadReceipts = useCallback(async (targetPage: number, targetSearch: string, targetWarehouseId: number | "") => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchStockReceipts({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                warehouse_id: typeof targetWarehouseId === "number" ? targetWarehouseId : undefined,
            });
            setItems(response.data ?? []);
            setMeta({
                current_page: response.current_page,
                last_page: response.last_page,
                total: response.total,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить приходы");
            setItems([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const response = await fetchWarehouses();
                setWarehouses(response.data ?? []);
                const defaultWarehouse = (response.data ?? []).find((item) => item.code === "main");
                if (defaultWarehouse) {
                    setWarehouseId(defaultWarehouse.id);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить склады");
            }
        };
        void loadWarehouses();
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch, warehouseId]);

    useEffect(() => {
        void loadReceipts(page, debouncedSearch, warehouseId);
    }, [loadReceipts, page, debouncedSearch, warehouseId]);

    const confirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        try {
            await deleteStockReceipt(deleteTarget.id);
            setDeleteTarget(null);
            await loadReceipts(page, debouncedSearch, warehouseId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось удалить приход");
        }
    };

    const handlePostReceipt = async (row: StockReceiptListItem) => {
        setPostingId(row.id);
        setError("");
        try {
            await postStockReceipt(row.id);
            await loadReceipts(page, debouncedSearch, warehouseId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось провести приход");
        } finally {
            setPostingId(null);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Склад: приходы"
                description="Черновик можно править; кнопка «Провести» оприходует товар на склад. Отмена проводки пока недоступна."
                action={
                    <div className="flex gap-2">
                        <Link
                            href="/admin/warehouse/receipts/new"
                            className="rounded-lg bg-admin-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-admin-primary-hover"
                        >
                            Создать приход
                        </Link>
                    </div>
                }
            >
                <AdminSearchInput
                    value={search}
                    onChangeAction={setSearch}
                    placeholder="Поиск по номеру документа, поставщику или коду"
                />
                <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-xl border px-3 py-2 text-sm"
                >
                    <option value="">Все склады</option>
                    {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                        </option>
                    ))}
                </select>
            </AdminTableToolbar>

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((prev) => Math.max(1, prev - 1))}
                        onNextAction={() => setPage((prev) => (meta && meta.current_page < meta.last_page ? prev + 1 : prev))}
                    />
                }
            >
                {loading ? (
                    <AdminLoadingState text="Загрузка приходов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Приходов пока нет"
                        description="Создайте первый документ прихода, чтобы начать работу со складом."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-4 py-3">Документ</th>
                                    <th className="px-4 py-3">Поставщик</th>
                                    <th className="px-4 py-3">Склад</th>
                                    <th className="px-4 py-3">Дата</th>
                                    <th className="px-4 py-3">Строки</th>
                                    <th className="px-4 py-3">Комментарий</th>
                                    <th className="px-4 py-3 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">#{item.document_no ?? item.id}</div>
                                            <div className="text-xs text-admin-text-secondary">{getStockReceiptStatusLabel(item.status)}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div>{item.supplier_name}</div>
                                            {item.supplier_code ? <div className="text-xs text-admin-text-secondary">{item.supplier_code}</div> : null}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.warehouse?.name ?? "—"}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{formatDate(item.received_at)}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">
                                        <AdminInfoButton
                                            count={item.items?.length ?? 0}
                                            onClickAction={() => setDetailRow(item)}
                                        />
                                            </td>
                                        <td className="max-w-[320px] px-4 py-3 text-xs text-admin-text-secondary">{item.comment || "—"}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-1.5">
                                                <Link
                                                    href={
                                                        item.status === STOCK_RECEIPT_STATUS.POSTED
                                                            ? `/admin/warehouse/receipts/${item.id}/show`
                                                            : `/admin/warehouse/receipts/${item.id}/edit`
                                                    }
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                    aria-label={item.status === STOCK_RECEIPT_STATUS.POSTED ? "Просмотр документа" : "Редактировать документ"}
                                                    title={item.status === STOCK_RECEIPT_STATUS.POSTED ? "Просмотр" : "Изменить"}
                                                >
                                                    {item.status === STOCK_RECEIPT_STATUS.POSTED ? <Eye size={16} /> : <Pencil size={16} />}
                                                </Link>
                                                {item.status === STOCK_RECEIPT_STATUS.DRAFT ? (
                                                    <button
                                                        type="button"
                                                        disabled={postingId === item.id}
                                                        onClick={() => void handlePostReceipt(item)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                                                        aria-label="Провести документ"
                                                        title={postingId === item.id ? "Проводим…" : "Провести"}
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteTarget(item)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                                    aria-label="Удалить документ"
                                                    title="Удалить"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление прихода"
                message={deleteTarget ? `Удалить приход #${deleteTarget.document_no ?? deleteTarget.id}?` : ""}
                confirmText="Удалить"
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={() => void confirmDelete()}
            />

            <ReceiptDetailsModal row={detailRow} onCloseAction={() => setDetailRow(null)} />
        </AdminPageCard>
    );
}
