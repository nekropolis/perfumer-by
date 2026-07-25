"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchStockWriteoffs,
    fetchStockWriteoff,
    fetchWarehouses,
    reverseStockWriteoff,
    STOCK_WRITEOFF_STATUS,
    getStockWriteoffStatusLabel,
    type StockWriteoffListItem,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";

function writeoffLineSourceLabel(writeoffType: string, payload: unknown): string {
    if (writeoffType === "order") {
        return "Заказ";
    }
    if (writeoffType === "reserve") {
        return "Резерв";
    }
    const src =
        payload && typeof payload === "object" && payload !== null && "stock_source" in payload
            ? String((payload as { stock_source?: string }).stock_source)
            : "";
    if (src === "reserved") {
        return "Резерв";
    }
    return "Свободно";
}

function WriteoffDetailsModal({
    row,
    onCloseAction,
    onReversedAction,
}: {
    row: StockWriteoffListItem | null;
    onCloseAction: () => void;
    onReversedAction: () => void;
}) {
    const [fetched, setFetched] = useState<StockWriteoffListItem | null>(null);
    const [loading, setLoading] = useState(false);
    const [canReverse, setCanReverse] = useState(false);
    const [busy, setBusy] = useState(false);
    const [modalError, setModalError] = useState("");

    useEffect(() => {
        if (!row) {
            setFetched(null);
            setCanReverse(false);
            setModalError("");
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setModalError("");

        void fetchStockWriteoff(row.id)
            .then((res) => {
                if (cancelled) {
                    return;
                }
                setFetched(res.data);
                setCanReverse(res.can_reverse);
            })
            .catch((e) => {
                if (!cancelled) {
                    setModalError(e instanceof Error ? e.message : "Не удалось загрузить списание");
                    setFetched(row);
                    setCanReverse(false);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [row]);

    if (!row) {
        return null;
    }

    const doc = fetched ?? row;

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
                        <h2 className="text-lg font-semibold">{typeLabel(doc.type)} #{doc.document_no ?? doc.id}</h2>
                        <p className="mt-1 text-sm text-admin-text-secondary">
                            {typeLabel(doc.type)} · {formatDate(doc.written_off_at)} · {getStockWriteoffStatusLabel(doc.status)}
                        </p>
                    </div>
                    <button type="button" onClick={onCloseAction} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-lg text-admin-text-secondary hover:bg-admin-muted">
                        ×
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <div className="mb-4 rounded-xl bg-admin-muted px-4 py-3 text-sm text-admin-text">
                        {doc.comment || "Комментарий не указан"}
                    </div>
                    {modalError ? (
                        <div className="mb-4">
                            <AdminFeedbackMessage type="error" message={modalError} onCloseAction={() => setModalError("")} />
                        </div>
                    ) : null}
                    {loading ? (
                        <AdminLoadingState text="Загрузка…" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">Товар</th>
                                        <th className="px-4 py-3">Вариант</th>
                                        <th className="px-4 py-3">Кол-во</th>
                                        <th className="px-4 py-3">Источник</th>
                                        <th className="px-4 py-3">Цена</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(doc.items ?? []).map((item) => (
                                        <tr key={item.id} className="border-b last:border-b-0">
                                            <td className="px-4 py-3">{item.product_name}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text">{item.variant_title}</td>
                                            <td className="px-4 py-3">{item.qty}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">
                                                {writeoffLineSourceLabel(doc.type, item.payload)}
                                            </td>
                                            <td className="px-4 py-3">{item.price ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="border-t px-5 py-4">
                    {doc.status === STOCK_WRITEOFF_STATUS.REVERSED ? (
                        <p className="text-sm text-admin-text-secondary">
                            {doc.type === "reserve" ? "Резерв отменён." : "Списание отменено."}
                        </p>
                    ) : null}
                    {canReverse ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                disabled={busy || loading}
                                onClick={() => {
                                    void (async () => {
                                        setBusy(true);
                                        setModalError("");
                                        try {
                                            await reverseStockWriteoff(row.id);
                                            onReversedAction();
                                            onCloseAction();
                                        } catch (e) {
                                            let msg = e instanceof Error
                                                ? e.message
                                                : (doc.type === "reserve"
                                                    ? "Не удалось отменить резерв"
                                                    : "Не удалось отменить списание");
                                            try {
                                                const parsed = JSON.parse(msg) as {
                                                    message?: string;
                                                    errors?: { writeoff?: string[] };
                                                };
                                                msg = parsed.message || parsed.errors?.writeoff?.[0] || msg;
                                            } catch {
                                                /* keep */
                                            }
                                            setModalError(msg);
                                        } finally {
                                            setBusy(false);
                                        }
                                    })();
                                }}
                                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                            >
                                {busy
                                    ? "Отмена…"
                                    : doc.type === "reserve"
                                        ? "Отменить резерв"
                                        : "Отменить списание"}
                            </button>
                            <span className="text-xs text-admin-text-secondary">
                                {doc.type === "reserve"
                                    ? "Снимет резерв со склада и пометит документ как отменённый."
                                    : "Вернёт остаток на физические склады; склад поставщика не меняется."}
                            </span>
                        </div>
                    ) : null}
                    {!loading && doc.status === STOCK_WRITEOFF_STATUS.POSTED && !canReverse && !modalError ? (
                        <p className="text-xs text-admin-text-secondary">
                            {doc.type === "reserve"
                                ? "Отмена недоступна для этого резерва."
                                : "Отмена недоступна: нет движений вне склада поставщика."}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

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

function typeLabel(type: string): string {
    if (type === "order") {
        return "Заказ";
    }

    if (type === "reserve") {
        return "Резерв";
    }

    if (type === "manual") {
        return "Ручное";
    }

    return type;
}

export default function AdminWarehouseWriteoffsPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<StockWriteoffListItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [page, setPage] = useUrlPage();
    const [search, setSearch] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [typeFilter, setTypeFilter] = useState("");
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [detailRow, setDetailRow] = useState<StockWriteoffListItem | null>(null);

    const debouncedSearch = useDebouncedValue(search, 350);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string, targetType: string, targetWarehouseId: number | "") => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchStockWriteoffs({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                type: targetType || undefined,
                warehouse_id: typeof targetWarehouseId === "number" ? targetWarehouseId : undefined,
            });

            setItems(response.data ?? []);
            setMeta({
                current_page: response.current_page,
                last_page: response.last_page,
                total: response.total,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить списания");
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

    useResetPageOnChange(setPage, [debouncedSearch, typeFilter, warehouseId]);

    useEffect(() => {
        void loadItems(page, debouncedSearch, typeFilter, warehouseId);
    }, [loadItems, page, debouncedSearch, typeFilter, warehouseId]);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Склад: списания"
                description="Документы списаний и резервов по складу."
                action={
                    <Link
                        href="/admin/warehouse/writeoffs/new"
                        className="rounded-lg bg-admin-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-admin-primary-hover"
                    >
                        Создать документ
                    </Link>
                }
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <>
                        <select
                            value={warehouseId}
                            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                            className="min-h-10 w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15 sm:w-auto"
                        >
                            <option value="">Все склады</option>
                            {warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="min-h-10 w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15 sm:w-auto"
                        >
                            <option value="">Все типы</option>
                            <option value="order">Заказ</option>
                            <option value="manual">Ручное</option>
                            <option value="reserve">Резерв</option>
                        </select>
                        <AdminSearchInput
                            value={search}
                            onChangeAction={setSearch}
                            placeholder="Поиск по документу, комментарию или ID заказа"
                            className="w-full sm:w-auto"
                        />
                    </>
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
                {loading ? (
                    <AdminLoadingState text="Загрузка списаний..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Списаний пока нет"
                        description="Документы появятся после ручного списания или перевода заказов в статус выполнен."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-4 py-3">Документ</th>
                                    <th className="px-4 py-3">Склад</th>
                                    <th className="px-4 py-3">Тип</th>
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
                                            {item.order_id ? <div className="text-xs text-admin-text-secondary">Заказ #{item.order_id}</div> : null}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.warehouse?.name ?? "—"}</td>
                                        <td className="px-4 py-3">
                                            <div>{typeLabel(item.type)}</div>
                                            <div className="text-xs text-admin-text-secondary">{getStockWriteoffStatusLabel(item.status)}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{formatDate(item.written_off_at)}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.items?.length ?? 0}</td>
                                        <td className="max-w-[420px] px-4 py-3 text-xs text-admin-text-secondary">{item.comment || "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setDetailRow(item)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                aria-label="Просмотр списания"
                                                title="Просмотр"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            <WriteoffDetailsModal
                row={detailRow}
                onCloseAction={() => setDetailRow(null)}
                onReversedAction={() => {
                    setSuccess("Списание отменено, остатки на физических складах восстановлены");
                    void loadItems(page, debouncedSearch, typeFilter, warehouseId);
                }}
            />
        </AdminPageCard>
    );
}
