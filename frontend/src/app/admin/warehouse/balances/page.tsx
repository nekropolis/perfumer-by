"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
    fetchStockBalances,
    fetchWarehouses,
    type StockBalanceItem,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";

export default function AdminWarehouseBalancesPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<StockBalanceItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useUrlPage();
    const [search, setSearch] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [stockState, setStockState] = useState("");
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

    const debouncedSearch = useDebouncedValue(search, 350);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string, targetState: string, targetWarehouseId: number | "") => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchStockBalances({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                stock_state: targetState || undefined,
                warehouse_id: typeof targetWarehouseId === "number" ? targetWarehouseId : undefined,
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

    useResetPageOnChange(setPage, [debouncedSearch, stockState, warehouseId]);

    useEffect(() => {
        void loadItems(page, debouncedSearch, stockState, warehouseId);
    }, [loadItems, page, debouncedSearch, stockState, warehouseId]);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Склад: остатки"
                description="Физический остаток, резерв и доступное количество по вариантам."
            >
                <AdminSearchInput
                    value={search}
                    onChangeAction={setSearch}
                    placeholder="Поиск по товару, slug или варианту"
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
                <select
                    value={stockState}
                    onChange={(e) => setStockState(e.target.value)}
                    className="rounded-xl border px-3 py-2 text-sm"
                >
                    <option value="">Все состояния</option>
                    <option value="in_stock">Наличие</option>
                    <option value="reserved">Резерв</option>
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
                    <AdminLoadingState text="Загрузка остатков..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Остатки не найдены"
                        description="Попробуйте изменить фильтр или создайте товары со складским учетом."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Склад</th>
                                    <th className="px-4 py-3">Бренд</th>
                                    <th className="px-4 py-3">Товар</th>
                                    <th className="px-4 py-3">Вариант</th>
                                    <th className="px-4 py-3">Кол-во</th>
                                    <th className="px-4 py-3">Резерв</th>
                                    <th className="px-4 py-3">Доступно</th>
                                    <th className="px-4 py-3">Цена</th>
                                    <th className="px-4 py-3 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3 font-medium text-slate-900">{item.id}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text">{item.warehouse_name || "—"}</td>
                                        <td className="px-4 py-3 text-xs text-admin-text">{item.brand_name || "—"}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{item.product_name || "—"}</div>
                                            <div className="text-xs text-admin-text-secondary">{item.product_slug || "—"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-admin-text">{item.variant_title}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900">{item.stock}</td>
                                        <td className="px-4 py-3">
                                            <span className={item.reserved_stock > 0 ? "font-medium text-amber-700" : "text-admin-text-secondary"}>
                                                {item.reserved_stock}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={item.available_stock > 0 ? "font-medium text-emerald-700" : "text-admin-text-secondary"}>
                                                {item.available_stock}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-admin-text">{item.price ?? "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            {item.available_stock > 0 || item.reserved_stock > 0 ? (
                                                <Link
                                                    href={`/admin/warehouse/writeoffs/new?warehouse_id=${item.warehouse_id ?? ""}&product_id=${item.product_id}&variant_id=${item.variant_id ?? item.id}&available_qty=${item.available_stock}&reserved_qty=${item.reserved_stock}&product_name=${encodeURIComponent(
                                                        item.product_name || ""
                                                    )}&variant_title=${encodeURIComponent(item.variant_title)}&price=${encodeURIComponent(
                                                        item.price != null ? String(item.price) : ""
                                                    )}`}
                                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    Списать
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-slate-400">Нет остатка</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>
        </AdminPageCard>
    );
}
