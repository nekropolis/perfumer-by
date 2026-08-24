"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Eye, List, Pencil, Trash2 } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminHeaderSelectFilter from "@/components/admin/ui/admin-header-select-filter";
import AdminOrdersDateRangeButton, {
    getAdminOrdersDateFilterLabel,
    type AdminOrdersDateRangeButtonHandle,
} from "@/components/admin/orders/admin-orders-date-range-button";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteStockReceipt,
    fetchStockReceipts,
    fetchWarehouseSuppliers,
    fetchWarehouses,
    getStockReceiptStatusLabel,
    postStockReceipt,
    type StockReceiptListItem,
    type WarehouseOption,
    type WarehouseSupplierOption,
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
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!row) {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [row]);

    if (!row || !mounted) {
        return null;
    }

    return createPortal(
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
                    <button type="button" onClick={onCloseAction} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-lg text-admin-text-secondary hover:bg-admin-muted">
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
                                    <th className="px-4 py-3">У поставщика</th>
                                    <th className="px-4 py-3">Комментарий</th>
                                    <th className="px-4 py-3">Кол-во</th>
                                    <th className="px-4 py-3">Цена</th>
                                    <th className="px-4 py-3">Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(row.items ?? []).map((item) => {
                                    const payload =
                                        item.payload && typeof item.payload === "object" ? item.payload : {};
                                    const supplierProductName = String(
                                        (payload as { supplier_product_name?: unknown }).supplier_product_name
                                            ?? (payload as { title?: unknown }).title
                                            ?? (payload as { name?: unknown }).name
                                            ?? "",
                                    ).trim();
                                    const lineComment = String(
                                        (payload as { comment?: unknown }).comment ?? "",
                                    ).trim();
                                    const supplierLine = [item.supplier_sku, supplierProductName]
                                        .filter(Boolean)
                                        .join(" — ");

                                    return (
                                        <tr key={item.id} className="border-b last:border-b-0 align-top">
                                            <td className="px-4 py-3">{item.product_name}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text">{item.variant_title}</td>
                                            <td className="max-w-[260px] px-4 py-3 text-xs text-admin-text-secondary">
                                                {supplierLine || "—"}
                                            </td>
                                            <td className="max-w-[220px] px-4 py-3 text-xs text-admin-text-secondary">
                                                {lineComment || "—"}
                                            </td>
                                            <td className="px-4 py-3">{item.qty}</td>
                                            <td className="px-4 py-3">{item.supplier_price}</td>
                                            <td className="px-4 py-3">{item.line_total ?? "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
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
    const [supplierId, setSupplierId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [suppliers, setSuppliers] = useState<WarehouseSupplierOption[]>([]);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [postingId, setPostingId] = useState<number | null>(null);
    const dateFilterRef = useRef<AdminOrdersDateRangeButtonHandle>(null);
    const hasDateFilter = Boolean(dateFrom.trim() || dateTo.trim());
    const dateFilterSummary = useMemo(
        () => getAdminOrdersDateFilterLabel([], { period: "", dateFrom, dateTo }),
        [dateFrom, dateTo],
    );

    const debouncedSearch = useDebouncedValue(search, 350);

    const loadReceipts = useCallback(async (
        targetPage: number,
        targetSearch: string,
        targetWarehouseId: number | "",
        targetSupplierId: number | "",
        targetDateFrom: string,
        targetDateTo: string,
    ) => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchStockReceipts({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                warehouse_id: typeof targetWarehouseId === "number" ? targetWarehouseId : undefined,
                supplier_id: typeof targetSupplierId === "number" ? targetSupplierId : undefined,
                date_from: targetDateFrom.trim() || undefined,
                date_to: targetDateTo.trim() || undefined,
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
        const loadFilterOptions = async () => {
            try {
                const [warehouseResponse, supplierResponse] = await Promise.all([
                    fetchWarehouses(),
                    fetchWarehouseSuppliers(),
                ]);
                setWarehouses(warehouseResponse.data ?? []);
                setSuppliers(supplierResponse.data ?? []);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить фильтры");
            }
        };
        void loadFilterOptions();
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch, warehouseId, supplierId, dateFrom, dateTo]);

    useEffect(() => {
        void loadReceipts(page, debouncedSearch, warehouseId, supplierId, dateFrom, dateTo);
    }, [loadReceipts, page, debouncedSearch, warehouseId, supplierId, dateFrom, dateTo]);

    const confirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setError("");
        try {
            await deleteStockReceipt(deleteTarget.id);
            setDeleteTarget(null);
            await loadReceipts(page, debouncedSearch, warehouseId, supplierId, dateFrom, dateTo);
        } catch (e) {
            setDeleteTarget(null);
            setError(
                e instanceof Error
                    ? e.message
                    : "Не удалось удалить приход. Если по партиям есть резервы — сначала снимите их.",
            );
        }
    };

    const handlePostReceipt = async (row: StockReceiptListItem) => {
        setPostingId(row.id);
        setError("");
        try {
            await postStockReceipt(row.id);
            await loadReceipts(page, debouncedSearch, warehouseId, supplierId, dateFrom, dateTo);
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
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <AdminSearchInput
                        value={search}
                        onChangeAction={setSearch}
                        placeholder="Поиск по номеру документа, поставщику или коду"
                        className="w-full sm:w-auto"
                    />
                }
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((prev) => Math.max(1, prev - 1))}
                        onNextAction={() => setPage((prev) => (meta && meta.current_page < meta.last_page ? prev + 1 : prev))}
                    />
                }
            >
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка приходов..." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-sm font-medium text-admin-text-secondary [&_th]:font-medium">
                                    <th className="whitespace-nowrap px-3 py-2">Номер</th>
                                    <th className="whitespace-nowrap px-3 py-2">Статус</th>
                                    <th className="whitespace-nowrap px-3 py-2">
                                        <AdminHeaderSelectFilter
                                            label="Склад"
                                            value={warehouseId === "" ? "" : String(warehouseId)}
                                            allLabel="Все склады"
                                            onChangeAction={(value) => setWarehouseId(value ? Number(value) : "")}
                                            options={warehouses.map((warehouse) => ({
                                                value: String(warehouse.id),
                                                label: warehouse.name,
                                            }))}
                                        />
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2">
                                        <AdminHeaderSelectFilter
                                            label="Поставщик"
                                            value={supplierId === "" ? "" : String(supplierId)}
                                            allLabel="Все поставщики"
                                            onChangeAction={(value) => setSupplierId(value ? Number(value) : "")}
                                            options={suppliers.map((supplier) => ({
                                                value: String(supplier.id),
                                                label: supplier.name,
                                            }))}
                                        />
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2">Комментарий</th>
                                    <th className="whitespace-nowrap px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={() => dateFilterRef.current?.open()}
                                            className="inline-flex cursor-pointer items-center gap-0.5 bg-transparent p-0 text-left text-sm font-medium text-admin-text-secondary transition hover:text-admin-text focus:outline-none"
                                            aria-label="Фильтр по дате"
                                            title={hasDateFilter ? dateFilterSummary : "Фильтр по дате"}
                                        >
                                            <span>{hasDateFilter ? dateFilterSummary : "Дата"}</span>
                                            <ChevronDown
                                                aria-hidden
                                                strokeWidth={2.25}
                                                className="h-3.5 w-3.5 shrink-0 opacity-70"
                                            />
                                        </button>
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-6">
                                            <AdminLoadingState text="Загрузка приходов..." />
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-6">
                                            <AdminEmptyState
                                                title={hasDateFilter || warehouseId !== "" || supplierId !== "" ? "Ничего не найдено" : "Приходов пока нет"}
                                                description={
                                                    hasDateFilter || warehouseId !== "" || supplierId !== ""
                                                        ? "По выбранным фильтрам документов нет."
                                                        : "Создайте первый документ прихода, чтобы начать работу со складом."
                                                }
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => {
                                        const supplierTitle = [item.supplier_name, item.supplier_code]
                                            .filter(Boolean)
                                            .join(" · ");

                                        return (
                                            <tr key={item.id} className="border-b last:border-b-0">
                                                <td className="whitespace-nowrap px-3 py-2 font-medium">#{item.document_no ?? item.id}</td>
                                                <td className="whitespace-nowrap px-3 py-2">{getStockReceiptStatusLabel(item.status)}</td>
                                                <td className="whitespace-nowrap px-3 py-2">{item.warehouse?.name ?? "—"}</td>
                                                <td className="max-w-[180px] truncate px-3 py-2" title={supplierTitle}>
                                                    {item.supplier_name}
                                                </td>
                                                <td className="max-w-[240px] truncate px-3 py-2 text-admin-text-secondary" title={item.comment || undefined}>
                                                    {item.comment || "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text-secondary">{formatDate(item.received_at)}</td>
                                                <td className="whitespace-nowrap px-3 py-2">
                                                    <div className="flex justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetailRow(item)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                            aria-label="Просмотр строк"
                                                            title="Строки"
                                                        >
                                                            <List size={16} />
                                                        </button>
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
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            <AdminOrdersDateRangeButton
                ref={dateFilterRef}
                hideTrigger
                value={{ period: "", dateFrom, dateTo }}
                onApplyAction={(next) => {
                    setDateFrom(next.dateFrom);
                    setDateTo(next.dateTo);
                }}
            />

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление прихода"
                message={
                    deleteTarget
                        ? `Удалить приход #${deleteTarget.document_no ?? deleteTarget.id}?${
                              deleteTarget.status === STOCK_RECEIPT_STATUS.POSTED
                                  ? " Документ оприходован: если по партиям есть резервы под заказы, удаление будет запрещено."
                                  : ""
                          }`
                        : ""
                }
                confirmText="Удалить"
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={() => void confirmDelete()}
            />

            <ReceiptDetailsModal row={detailRow} onCloseAction={() => setDetailRow(null)} />
        </AdminPageCard>
    );
}
