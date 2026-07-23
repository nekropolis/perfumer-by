"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Info, PackageMinus } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import {
    fetchStockBalances,
    fetchStockBalanceVariantSuppliers,
    fetchWarehouses,
    type StockBalanceItem,
    type StockBalanceVariantSupplierRow,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type SortColumn = "stock" | "reserved";
type SortDir = "asc" | "desc";
type TableSort = { column: SortColumn; dir: SortDir } | null;

function sortTitle(column: SortColumn, active: TableSort): string {
    const label = column === "stock" ? "количеству" : "резерву";
    if (active?.column !== column) {
        return `Сортировать по ${label}`;
    }
    if (active.dir === "desc") {
        return "Сортировка: от большего к меньшему. Нажмите для обратной";
    }
    return "Сортировка: от меньшего к большему. Нажмите для сброса";
}

function SortHeaderButton({
    label,
    column,
    active,
    onToggleAction,
}: {
    label: string;
    column: SortColumn;
    active: TableSort;
    onToggleAction: (column: SortColumn) => void;
}) {
    const isActive = active?.column === column;
    const title = sortTitle(column, active);

    return (
        <button
            type="button"
            onClick={() => onToggleAction(column)}
            title={title}
            aria-label={title}
            className={`inline-flex items-center gap-1 rounded px-0.5 py-0.5 transition hover:text-admin-text ${
                isActive ? "text-admin-text" : ""
            }`}
        >
            {label}
            {isActive && active.dir === "desc" ? (
                <ArrowDown size={12} aria-hidden />
            ) : isActive && active.dir === "asc" ? (
                <ArrowUp size={12} aria-hidden />
            ) : (
                <ArrowUpDown size={12} aria-hidden className="opacity-50" />
            )}
        </button>
    );
}

export default function AdminWarehouseBalancesPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<StockBalanceItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(25);
    const [tableSort, setTableSort] = useState<TableSort>(null);
    const [search, setSearch] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [stockState, setStockState] = useState("");
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [suppliersTarget, setSuppliersTarget] = useState<StockBalanceItem | null>(null);
    const [supplierRows, setSupplierRows] = useState<StockBalanceVariantSupplierRow[]>([]);
    const [suppliersLoading, setSuppliersLoading] = useState(false);
    const [suppliersError, setSuppliersError] = useState("");

    const debouncedSearch = useDebouncedValue(search, 350);

    const loadItems = useCallback(async (
        targetPage: number,
        targetSearch: string,
        targetState: string,
        targetWarehouseId: number | "",
        targetPerPage: number,
        targetSort: TableSort,
    ) => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchStockBalances({
                page: targetPage,
                per_page: targetPerPage,
                search: targetSearch.trim() || undefined,
                stock_state: targetState || undefined,
                warehouse_id: typeof targetWarehouseId === "number" ? targetWarehouseId : undefined,
                sort: targetSort?.column ?? "brand",
                dir: targetSort?.dir ?? "asc",
            });

            setItems(response.data ?? []);
            setMeta({
                current_page: response.current_page,
                last_page: response.last_page,
                total: response.total,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить остатки");
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

    useResetPageOnChange(setPage, [debouncedSearch, stockState, warehouseId, perPage, tableSort]);

    useEffect(() => {
        void loadItems(page, debouncedSearch, stockState, warehouseId, perPage, tableSort);
    }, [loadItems, page, debouncedSearch, stockState, warehouseId, perPage, tableSort]);

    const toggleSort = (column: SortColumn) => {
        setTableSort((prev) => {
            if (prev?.column !== column) {
                return { column, dir: "desc" };
            }
            if (prev.dir === "desc") {
                return { column, dir: "asc" };
            }
            return null;
        });
    };

    const openSuppliersInfo = (item: StockBalanceItem) => {
        setSuppliersTarget(item);
        setSupplierRows([]);
        setSuppliersError("");
    };

    useEffect(() => {
        if (!suppliersTarget) {
            return;
        }

        const variantId = suppliersTarget.variant_id;
        if (!variantId) {
            setSuppliersError("У позиции нет привязанного варианта");
            setSupplierRows([]);
            setSuppliersLoading(false);
            return;
        }

        let cancelled = false;
        setSuppliersLoading(true);
        setSuppliersError("");

        void fetchStockBalanceVariantSuppliers({
            variant_id: variantId,
            warehouse_id: suppliersTarget.warehouse_id,
            stock: suppliersTarget.stock,
        })
            .then((response) => {
                if (!cancelled) {
                    setSupplierRows(response.data ?? []);
                }
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setSupplierRows([]);
                    setSuppliersError(e instanceof Error ? e.message : "Не удалось загрузить поставщиков");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setSuppliersLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [suppliersTarget]);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Склад: остатки"
                description="Физический остаток, резерв и доступное количество по вариантам."
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        <select
                            value={warehouseId}
                            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-sm"
                        >
                            <option value="">Все склады</option>
                            {warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={stockState}
                            onChange={(e) => setStockState(e.target.value)}
                            className="rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-sm"
                        >
                            <option value="">Все состояния</option>
                            <option value="in_stock">Наличие</option>
                            <option value="reserved">Резерв</option>
                        </select>
                        <AdminSearchInput
                            value={search}
                            onChangeAction={setSearch}
                            placeholder="Поиск по бренду, товару или цене"
                        />
                    </div>
                }
                footer={
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
                            На странице
                            <select
                                value={perPage}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (v === 25 || v === 50 || v === 100) {
                                        setPerPage(v);
                                    }
                                }}
                                className="rounded-lg border border-admin-border bg-white px-2 py-1.5 text-sm"
                            >
                                {PER_PAGE_OPTIONS.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <AdminPagination
                            currentPage={meta?.current_page ?? 1}
                            lastPage={meta?.last_page ?? 1}
                            onPrevAction={() => setPage((prev) => Math.max(1, prev - 1))}
                            onNextAction={() => setPage((prev) => (meta && meta.current_page < meta.last_page ? prev + 1 : prev))}
                        />
                    </div>
                }
            >
                {loading ? (
                    <AdminLoadingState text="Загрузка остатков..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Остатки не найдены"
                        description="Попробуйте изменить фильтр или создайте товары со складским учетом."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-2 py-1.5 font-medium">ID</th>
                                    <th className="px-2 py-1.5 font-medium">Бренд</th>
                                    <th className="px-2 py-1.5 font-medium">Товар</th>
                                    <th className="px-2 py-1.5 font-medium">Вариант</th>
                                    <th className="px-2 py-1.5 font-medium">
                                        <SortHeaderButton
                                            label="Кол-во"
                                            column="stock"
                                            active={tableSort}
                                            onToggleAction={toggleSort}
                                        />
                                    </th>
                                    <th className="px-2 py-1.5 font-medium">
                                        <SortHeaderButton
                                            label="Резерв"
                                            column="reserved"
                                            active={tableSort}
                                            onToggleAction={toggleSort}
                                        />
                                    </th>
                                    <th className="px-2 py-1.5 font-medium">Доступно</th>
                                    <th className="px-2 py-1.5 font-medium">Цена</th>
                                    <th className="px-2 py-1.5 font-medium">Склад</th>
                                    <th className="w-10 px-2 py-1.5 text-right font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const brandLabel = item.brand_name || "—";
                                    const productLabel = item.product_name || "—";
                                    const priceLabel = item.price != null ? String(item.price) : "—";
                                    const productHref = item.product_slug ? `/${item.product_slug}` : null;
                                    const canWriteOff = item.available_stock > 0 || item.reserved_stock > 0;

                                    return (
                                        <tr key={item.id} className="border-b last:border-b-0 hover:bg-admin-muted/50">
                                            <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">{item.id}</td>
                                            <td className="px-2 py-1.5 text-admin-text">
                                                {highlightAdminSearchTerms(brandLabel, debouncedSearch)}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {productHref ? (
                                                    <Link
                                                        href={productHref}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                                                    >
                                                        {highlightAdminSearchTerms(productLabel, debouncedSearch, item.brand_name)}
                                                    </Link>
                                                ) : (
                                                    <span className="font-medium">
                                                        {highlightAdminSearchTerms(productLabel, debouncedSearch, item.brand_name)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-admin-text">{item.variant_title}</td>
                                            <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">{item.stock}</td>
                                            <td className="whitespace-nowrap px-2 py-1.5">
                                                <span className={item.reserved_stock > 0 ? "font-medium text-amber-700" : "text-admin-text-secondary"}>
                                                    {item.reserved_stock}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-2 py-1.5">
                                                <span className={item.available_stock > 0 ? "font-medium text-emerald-700" : "text-admin-text-secondary"}>
                                                    {item.available_stock}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-2 py-1.5 text-admin-text">
                                                {highlightAdminSearchTerms(priceLabel, debouncedSearch)}
                                            </td>
                                            <td className="px-2 py-1.5 text-admin-text">{item.warehouse_name || "—"}</td>
                                            <td className="px-2 py-1.5 text-right">
                                                <div className="inline-flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openSuppliersInfo(item)}
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                        aria-label="Поставщики"
                                                        title="Поставщики"
                                                    >
                                                        <Info size={14} />
                                                    </button>
                                                    {canWriteOff ? (
                                                        <Link
                                                            prefetch={false}
                                                            href={`/admin/warehouse/writeoffs/new?warehouse_id=${item.warehouse_id ?? ""}&product_id=${item.product_id}&variant_id=${item.variant_id ?? item.id}&available_qty=${item.available_stock}&reserved_qty=${item.reserved_stock}&product_name=${encodeURIComponent(
                                                                item.product_name || ""
                                                            )}&variant_title=${encodeURIComponent(item.variant_title)}&price=${encodeURIComponent(
                                                                item.price != null ? String(item.price) : ""
                                                            )}`}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                            aria-label="Списать"
                                                            title="Списать"
                                                        >
                                                            <PackageMinus size={14} />
                                                        </Link>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            <AdminModalShell
                open={suppliersTarget != null}
                onCloseAction={() => setSuppliersTarget(null)}
                title="Поставщики"
                maxWidthClass="sm:max-w-4xl"
            >
                {suppliersTarget ? (
                    <div className="space-y-3">
                        <div className="text-sm text-admin-text-secondary">
                            {[suppliersTarget.brand_name, suppliersTarget.product_name]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            {suppliersTarget.variant_title ? ` · ${suppliersTarget.variant_title}` : ""}
                        </div>

                        {suppliersLoading ? (
                            <div className="text-sm text-admin-text-secondary">Загрузка поставщиков...</div>
                        ) : suppliersError ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {suppliersError}
                            </div>
                        ) : supplierRows.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-admin-border p-4 text-sm text-admin-text-secondary">
                                Для этого варианта нет данных по поставщикам.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-admin-border">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-admin-muted text-left text-admin-text-secondary">
                                        <tr>
                                            <th className="min-w-[9rem] px-3 py-2 font-medium">Поставщик</th>
                                            <th className="px-3 py-2 font-medium">Артикул</th>
                                            <th className="min-w-[14rem] px-3 py-2 font-medium">Название у поставщика</th>
                                            <th className="px-3 py-2 font-medium">Кол-во</th>
                                            <th className="px-3 py-2 font-medium">Цена</th>
                                            <th className="px-3 py-2 font-medium">Дата прихода</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {supplierRows.map((row, index) => (
                                            <tr
                                                key={`${row.source}-${row.supplier_name}-${row.supplier_sku}-${index}`}
                                                className="border-t border-admin-border"
                                            >
                                                <td
                                                    className="whitespace-normal break-words px-3 py-2 text-admin-text"
                                                    title={row.supplier_name || undefined}
                                                >
                                                    {row.supplier_name || "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text">{row.supplier_sku || "—"}</td>
                                                <td
                                                    className="whitespace-normal break-words px-3 py-2 text-admin-text"
                                                    title={row.supplier_product_name || undefined}
                                                >
                                                    {row.supplier_product_name || "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text">
                                                    {row.qty != null ? `${row.qty} шт.` : "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text">
                                                    {row.supplier_price != null ? String(row.supplier_price) : "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text">
                                                    {row.received_at || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : null}
            </AdminModalShell>
        </AdminPageCard>
    );
}
