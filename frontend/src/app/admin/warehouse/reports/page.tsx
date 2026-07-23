"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Eye, PackagePlus, ReceiptText } from "lucide-react";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { fetchProducts, smartSearchProducts, type ProductAdminItem, type ProductSmartSearchItem } from "@/lib/admin-products-api";
import {
    fetchWarehouses,
    fetchWarehouseSuppliers,
    fetchStockReceiptsReport,
    fetchStockSalesReport,
    fetchStockWriteoffsReport,
    fetchStockWriteoff,
    reverseStockWriteoff,
    STOCK_WRITEOFF_STATUS,
    getStockWriteoffStatusLabel,
    type StockReceiptListItem,
    type StockSalesReportRow,
    type StockWriteoffListItem,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import AdminInfoButton from "@/components/admin/ui/admin-info-button";

type ReportTab = "receipts" | "writeoffs" | "sales";

function writeoffLineSourceLabel(writeoffType: string, payload: unknown): string {
    if (writeoffType === "order") {
        return "Заказ";
    }
    const src =
        payload && typeof payload === "object" && "stock_source" in payload
            ? String((payload as { stock_source?: string }).stock_source)
            : "";
    if (src === "reserved") {
        return "Резерв";
    }
    return "Свободно";
}

function mapWriteoffDetailRows(doc: StockWriteoffListItem | null | undefined): ReportDetailRow[] {
    if (!doc?.items?.length) {
        return [];
    }

    return doc.items.map((it) => ({
        id: it.id,
        product_name: it.product_name,
        variant_title: it.variant_title,
        qty: it.qty,
        price: it.price ?? null,
        line_total: null,
        source: writeoffLineSourceLabel(doc.type, it.payload),
    }));
}

const REPORT_TABS: AdminRichTabItem<ReportTab>[] = [
    {
        id: "receipts",
        label: "Приходы",
        description: "Поступления по поставщикам и датам",
        icon: PackagePlus,
    },
    {
        id: "writeoffs",
        label: "Списания",
        description: "Ручные и заказные списания",
        icon: ReceiptText,
    },
    {
        id: "sales",
        label: "Продажи",
        description: "Агрегация выручки и заказов",
        icon: BarChart3,
    },
];

function formatDate(value?: string | null): string {
    if (!value) return "Не указана";
    try {
        return new Date(value).toLocaleString("ru-RU");
    } catch {
        return value;
    }
}

type ReportDetailRow = {
    id: number;
    product_name: string;
    variant_title: string;
    qty: number;
    price?: string | number | null;
    line_total?: string | number | null;
    source?: string | null;
};

function ReportDetailsModal({
    title,
    subtitle,
    rows,
    onCloseAction,
    loading,
    footer,
    showWriteoffSourceColumn,
}: {
    title: string;
    subtitle: string;
    rows: ReportDetailRow[];
    onCloseAction: () => void;
    loading?: boolean;
    footer?: ReactNode;
    showWriteoffSourceColumn?: boolean;
}) {
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
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <p className="mt-1 text-sm text-admin-text-secondary">{subtitle}</p>
                    </div>
                    <button type="button" onClick={onCloseAction} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-lg text-admin-text-secondary hover:bg-admin-muted">
                        ×
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    {loading ? (
                        <AdminLoadingState text="Загрузка строк документа..." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">Товар</th>
                                        <th className="px-4 py-3">Вариант</th>
                                        <th className="px-4 py-3">Кол-во</th>
                                        {showWriteoffSourceColumn ? <th className="px-4 py-3">Источник</th> : null}
                                        <th className="px-4 py-3">Цена</th>
                                        <th className="px-4 py-3">Сумма</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.id} className="border-b last:border-b-0">
                                            <td className="px-4 py-3">{row.product_name}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text">{row.variant_title}</td>
                                            <td className="px-4 py-3">{row.qty}</td>
                                            {showWriteoffSourceColumn ? (
                                                <td className="px-4 py-3 text-xs text-admin-text-secondary">{row.source ?? "—"}</td>
                                            ) : null}
                                            <td className="px-4 py-3">{row.price ?? "—"}</td>
                                            <td className="px-4 py-3">{row.line_total ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {footer ? <div className="border-t px-5 py-4">{footer}</div> : null}
            </div>
        </div>
    );
}

export default function WarehouseReportsPage() {
    const [activeTab, setActiveTab] = useState<ReportTab>("receipts");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [page, setPage] = useUrlPage();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const [supplierId, setSupplierId] = useState<number | "">("");
    const [writeoffType, setWriteoffType] = useState("");
    const [salesReportBy, setSalesReportBy] = useState<"orders" | "products">("orders");
    const [groupBy, setGroupBy] = useState<"day" | "month" | "year">("day");
    const [salesProductIds, setSalesProductIds] = useState<number[]>([]);
    const [salesProductsOpen, setSalesProductsOpen] = useState(false);
    const [salesProductsQuery, setSalesProductsQuery] = useState("");
    const [salesSmartOptions, setSalesSmartOptions] = useState<ProductSmartSearchItem[]>([]);
    const [salesSmartLoading, setSalesSmartLoading] = useState(false);
    const [receiptProductId, setReceiptProductId] = useState<number | "">("");
    const [writeoffProductId, setWriteoffProductId] = useState<number | "">("");
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [suppliers, setSuppliers] = useState<WarehouseSupplierOption[]>([]);

    const [products, setProducts] = useState<ProductAdminItem[]>([]);
    const selectedSalesProducts = useMemo(
        () =>
            salesProductIds
                .map((id) => salesSmartOptions.find((option) => option.id === id) ?? products.find((product) => product.id === id))
                .filter((item): item is ProductSmartSearchItem | ProductAdminItem => Boolean(item)),
        [products, salesProductIds, salesSmartOptions]
    );

    const filteredSalesProducts = useMemo(() => {
        if (salesProductsQuery.trim().length >= 2) {
            return salesSmartOptions;
        }
        return products.slice(0, 100).map((product) => ({
            id: product.id,
            name: product.name,
            brand_name: null,
            variant_titles: [],
            score: 1,
        }));
    }, [products, salesProductsQuery, salesSmartOptions]);
    const salesProductToggle = useCallback((id: number) => {
        setSalesProductIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
    }, []);

    const [receiptItems, setReceiptItems] = useState<StockReceiptListItem[]>([]);
    const [receiptMeta, setReceiptMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [receiptSummary, setReceiptSummary] = useState<{ documents_count: number; qty_total: number; amount_total: number } | null>(null);

    const [writeoffItems, setWriteoffItems] = useState<StockWriteoffListItem[]>([]);
    const [writeoffMeta, setWriteoffMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [writeoffSummary, setWriteoffSummary] = useState<{ documents_count: number; qty_total: number } | null>(null);

    const [salesRows, setSalesRows] = useState<StockSalesReportRow[]>([]);
    const [salesSummary, setSalesSummary] = useState<{ orders_count: number; qty_total: number; revenue_total: number } | null>(null);
    const [receiptDetailRow, setReceiptDetailRow] = useState<StockReceiptListItem | null>(null);
    const [writeoffDetailRow, setWriteoffDetailRow] = useState<StockWriteoffListItem | null>(null);
    const [writeoffDetailLoading, setWriteoffDetailLoading] = useState(false);
    const [writeoffDetailFetched, setWriteoffDetailFetched] = useState<StockWriteoffListItem | null>(null);
    const [writeoffCanReverse, setWriteoffCanReverse] = useState(false);
    const [writeoffReverseBusy, setWriteoffReverseBusy] = useState(false);
    const [writeoffModalError, setWriteoffModalError] = useState("");

    const loadProducts = useCallback(async () => {
        try {
            const response = await fetchProducts({ page: 1 });
            setProducts(response.data ?? []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        void loadProducts();
    }, [loadProducts]);

    useEffect(() => {
        const loadSuppliers = async () => {
            try {
                const response = await fetchWarehouseSuppliers();
                setSuppliers(response.data ?? []);
            } catch (e) {
                console.error(e);
            }
        };
        void loadSuppliers();
    }, []);

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const response = await fetchWarehouses();
                setWarehouses(response.data ?? []);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить склады");
            }
        };
        void loadWarehouses();
    }, []);

    useEffect(() => {
        if (activeTab !== "sales") {
            return;
        }
        if (dateFrom || dateTo) {
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        setDateFrom(today);
        setDateTo(today);
    }, [activeTab, dateFrom, dateTo]);

    useEffect(() => {
        if (!salesProductsOpen) {
            return;
        }

        const query = salesProductsQuery.trim();
        if (query.length < 2) {
            setSalesSmartOptions([]);
            setSalesSmartLoading(false);
            return;
        }

        let cancelled = false;
        setSalesSmartLoading(true);
        const timeoutId = setTimeout(() => {
            void smartSearchProducts({ q: query, limit: 40 })
                .then((response) => {
                    if (!cancelled) {
                        setSalesSmartOptions(response.data ?? []);
                    }
                })
                .catch((e) => {
                    if (!cancelled) {
                        console.error(e);
                        setSalesSmartOptions([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setSalesSmartLoading(false);
                    }
                });
        }, 280);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [salesProductsOpen, salesProductsQuery]);

    useResetPageOnChange(setPage, [
        activeTab,
        dateFrom,
        dateTo,
        supplierId,
        writeoffType,
        warehouseId,
        receiptProductId,
        writeoffProductId,
    ]);

    const loadReceipts = useCallback(async () => {
        const response = await fetchStockReceiptsReport({
            page,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            supplier_id: typeof supplierId === "number" ? supplierId : undefined,
            product_id: typeof receiptProductId === "number" ? receiptProductId : undefined,
            warehouse_id: typeof warehouseId === "number" ? warehouseId : undefined,
        });
        setReceiptItems(response.data ?? []);
        setReceiptMeta({
            current_page: response.current_page,
            last_page: response.last_page,
            total: response.total,
        });
        setReceiptSummary(response.summary);
    }, [page, dateFrom, dateTo, supplierId, warehouseId, receiptProductId]);

    const loadWriteoffs = useCallback(async () => {
        const response = await fetchStockWriteoffsReport({
            page,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            type: writeoffType || undefined,
            product_id: typeof writeoffProductId === "number" ? writeoffProductId : undefined,
            warehouse_id: typeof warehouseId === "number" ? warehouseId : undefined,
        });
        setWriteoffItems(response.data ?? []);
        setWriteoffMeta({
            current_page: response.current_page,
            last_page: response.last_page,
            total: response.total,
        });
        setWriteoffSummary(response.summary);
    }, [page, dateFrom, dateTo, writeoffType, warehouseId, writeoffProductId]);

    const loadSales = useCallback(async () => {
        const response = await fetchStockSalesReport({
            report_by: salesReportBy,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            group_by: salesReportBy === "orders" ? groupBy : undefined,
            product_ids: salesProductIds.length > 0 ? salesProductIds : undefined,
            warehouse_id: typeof warehouseId === "number" ? warehouseId : undefined,
        });
        setSalesRows(response.data ?? []);
        setSalesSummary(response.summary);
    }, [dateFrom, dateTo, groupBy, salesProductIds, warehouseId, salesReportBy]);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            setError("");

            try {
                if (activeTab === "receipts") {
                    await loadReceipts();
                } else if (activeTab === "writeoffs") {
                    await loadWriteoffs();
                } else {
                    await loadSales();
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить отчет");
            } finally {
                setLoading(false);
            }
        };

        void run();
    }, [activeTab, loadReceipts, loadWriteoffs, loadSales]);

    useEffect(() => {
        if (!writeoffDetailRow) {
            setWriteoffDetailFetched(null);
            setWriteoffCanReverse(false);
            setWriteoffModalError("");
            setWriteoffDetailLoading(false);
            return;
        }

        let cancelled = false;
        setWriteoffDetailLoading(true);
        setWriteoffModalError("");

        void fetchStockWriteoff(writeoffDetailRow.id)
            .then((res) => {
                if (cancelled) {
                    return;
                }
                setWriteoffDetailFetched(res.data);
                setWriteoffCanReverse(res.can_reverse);
            })
            .catch((e) => {
                if (!cancelled) {
                    setWriteoffModalError(e instanceof Error ? e.message : "Не удалось загрузить списание");
                    setWriteoffDetailFetched(writeoffDetailRow);
                    setWriteoffCanReverse(false);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setWriteoffDetailLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [writeoffDetailRow]);

    const writeoffModalDoc = writeoffDetailFetched ?? writeoffDetailRow;

    return (
        <AdminPageCard>
            <AdminRichTabs
                items={REPORT_TABS}
                activeTab={activeTab}
                onChangeAction={setActiveTab}
            />

            <AdminTableToolbar
                title="Склад: отчеты"
                description="Единая страница для аналитики по приходам, списаниям и продажам."
            />

            <div className="mb-4 flex flex-wrap gap-3">
                <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                />
                <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-lg border px-3 py-2 text-sm"
                >
                    <option value="">Все склады</option>
                    {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                        </option>
                    ))}
                </select>
                <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                />

                {activeTab === "receipts" ? (
                    <>
                        <select
                            value={supplierId}
                            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="">Все поставщики</option>
                            {suppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={receiptProductId}
                            onChange={(e) => setReceiptProductId(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="">Все товары</option>
                            {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name}
                                </option>
                            ))}
                        </select>
                    </>
                ) : null}

                {activeTab === "writeoffs" ? (
                    <>
                        <select
                            value={writeoffProductId}
                            onChange={(e) => setWriteoffProductId(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="">Все товары</option>
                            {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={writeoffType}
                            onChange={(e) => setWriteoffType(e.target.value)}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="">Все типы</option>
                            <option value="order">Заказ</option>
                            <option value="manual">Ручное</option>
                            <option value="reserve">Резерв</option>
                        </select>
                    </>
                ) : null}

                {activeTab === "sales" ? (
                    <>
                        <select
                            value={salesReportBy}
                            onChange={(e) => setSalesReportBy(e.target.value as "orders" | "products")}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="orders">По заказам</option>
                            <option value="products">По товарам</option>
                        </select>
                        {salesReportBy === "orders" ? (
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as "day" | "month" | "year")}
                            className="rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="day">По дням</option>
                            <option value="month">По месяцам</option>
                            <option value="year">По годам</option>
                        </select>
                        ) : null}
                        <div className="relative min-w-[260px]">
                            <button
                                type="button"
                                onClick={() => setSalesProductsOpen((prev) => !prev)}
                                className="w-full rounded-lg border bg-white px-3 py-2 text-left text-sm"
                            >
                                {salesProductIds.length > 0 ? `Товары: ${salesProductIds.length}` : "Все товары"}
                            </button>
                            {salesProductsOpen ? (
                                <div className="absolute z-20 mt-2 w-[380px] max-w-[80vw] rounded-xl border bg-white p-3 shadow-xl">
                                    <input
                                        value={salesProductsQuery}
                                        onChange={(e) => setSalesProductsQuery(e.target.value)}
                                        placeholder="Умный поиск товара..."
                                        className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
                                    />
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs text-admin-text-secondary">
                                            Выбрано: {salesProductIds.length}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSalesProductIds([])}
                                            className="text-xs text-admin-text-secondary underline"
                                        >
                                            Сбросить
                                        </button>
                                    </div>
                                    <div className="max-h-60 space-y-1 overflow-y-auto">
                                        {selectedSalesProducts.length > 0 ? (
                                            <div className="mb-1 border-b pb-2">
                                                {selectedSalesProducts.map((product) => (
                                                    <label key={`selected-${product.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-admin-muted">
                                                        <input
                                                            type="checkbox"
                                                            checked
                                                            onChange={() => salesProductToggle(product.id)}
                                                        />
                                                        <span className="truncate">{product.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        ) : null}
                                        {filteredSalesProducts.map((product) => {
                                            const checked = salesProductIds.includes(product.id);
                                            return (
                                                <label key={product.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-admin-muted">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => salesProductToggle(product.id)}
                                                    />
                                                    <span className="truncate">
                                                        {product.name}
                                                        {"brand_name" in product && product.brand_name ? ` (${product.brand_name})` : ""}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                        {salesSmartLoading ? (
                                            <div className="px-2 py-3 text-xs text-admin-text-secondary">Поиск...</div>
                                        ) : filteredSalesProducts.length === 0 ? (
                                            <div className="px-2 py-3 text-xs text-admin-text-secondary">
                                                {salesProductsQuery.trim().length >= 2 ? "Ничего не найдено" : "Введите минимум 2 символа"}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </div>

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            {activeTab === "receipts" && receiptSummary ? (
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Документов: <span className="font-semibold">{receiptSummary.documents_count}</span></div>
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Всего единиц: <span className="font-semibold">{receiptSummary.qty_total}</span></div>
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Сумма: <span className="font-semibold">{receiptSummary.amount_total.toFixed(2)}</span></div>
                </div>
            ) : null}

            {activeTab === "writeoffs" && writeoffSummary ? (
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Документов: <span className="font-semibold">{writeoffSummary.documents_count}</span></div>
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Всего единиц: <span className="font-semibold">{writeoffSummary.qty_total}</span></div>
                </div>
            ) : null}

            {activeTab === "sales" && salesSummary ? (
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                    {salesReportBy === "orders" ? (
                        <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Заказов: <span className="font-semibold">{salesSummary.orders_count}</span></div>
                    ) : (
                        <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Позиций в отчете: <span className="font-semibold">{salesRows.length}</span></div>
                    )}
                    <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Единиц: <span className="font-semibold">{salesSummary.qty_total}</span></div>
                    {salesReportBy === "orders" ? (
                        <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Выручка: <span className="font-semibold">{salesSummary.revenue_total.toFixed(2)}</span></div>
                    ) : (
                        <div className="rounded-lg border bg-admin-muted px-4 py-3 text-sm">Период: <span className="font-semibold">{dateFrom || "—"} - {dateTo || "—"}</span></div>
                    )}
                </div>
            ) : null}

            {activeTab === "sales" ? (
                loading ? (
                    <AdminLoadingState text="Загрузка отчета..." />
                ) : salesRows.length === 0 ? (
                    <AdminEmptyState title="Данных нет" description="Попробуйте изменить фильтры отчета по продажам." />
                ) : (
                    <div className="overflow-x-auto">
                        {salesReportBy === "orders" ? (
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">Период</th>
                                        <th className="px-4 py-3">Заказы</th>
                                        <th className="px-4 py-3">Единицы</th>
                                        <th className="px-4 py-3">Выручка</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesRows.map((row) => (
                                        <tr key={row.period ?? `${row.product_id}-${row.variant_title}`} className="border-b last:border-b-0">
                                            <td className="px-4 py-3 font-medium">{row.period ?? "—"}</td>
                                            <td className="px-4 py-3">{row.orders_count ?? 0}</td>
                                            <td className="px-4 py-3">{row.qty_total}</td>
                                            <td className="px-4 py-3">{Number(row.revenue_total ?? 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">ID товара</th>
                                        <th className="px-4 py-3">Имя товара / вариант</th>
                                        <th className="px-4 py-3">Кол-во</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesRows.map((row) => (
                                        <tr key={`${row.product_id}-${row.variant_title}`} className="border-b last:border-b-0">
                                            <td className="px-4 py-3 font-medium">{row.product_id ?? "—"}</td>
                                            <td className="px-4 py-3">
                                                {row.product_name ?? "—"}
                                                {row.variant_title ? ` / ${row.variant_title}` : ""}
                                            </td>
                                            <td className="px-4 py-3">{row.qty_total}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )
            ) : (
                <AdminTableShell
                    total={(activeTab === "receipts" ? receiptMeta?.total : writeoffMeta?.total) ?? 0}
                    footer={
                        <AdminPagination
                            currentPage={(activeTab === "receipts" ? receiptMeta?.current_page : writeoffMeta?.current_page) ?? 1}
                            lastPage={(activeTab === "receipts" ? receiptMeta?.last_page : writeoffMeta?.last_page) ?? 1}
                            onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                            onNextAction={() =>
                                setPage((p) => {
                                    const meta = activeTab === "receipts" ? receiptMeta : writeoffMeta;
                                    return meta && meta.current_page < meta.last_page ? p + 1 : p;
                                })
                            }
                        />
                    }
                >
                    {loading ? (
                        <AdminLoadingState text="Загрузка отчета..." />
                    ) : activeTab === "receipts" && receiptItems.length === 0 ? (
                        <AdminEmptyState title="Данных нет" description="Попробуйте изменить фильтры отчета по приходам." />
                    ) : activeTab === "writeoffs" && writeoffItems.length === 0 ? (
                        <AdminEmptyState title="Данных нет" description="Попробуйте изменить фильтры отчета по списаниям." />
                    ) : activeTab === "receipts" ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">Документ</th>
                                        <th className="px-4 py-3">Поставщик</th>
                                        <th className="px-4 py-3">Дата</th>
                                        <th className="px-4 py-3">Строки</th>
                                        <th className="px-4 py-3">Комментарий</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receiptItems.map((item) => (
                                        <tr key={item.id} className="border-b last:border-b-0">
                                            <td className="px-4 py-3 font-medium">{`Приход #${item.document_no ?? item.id}`}</td>
                                            <td className="px-4 py-3">{item.supplier_name}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">{formatDate(item.received_at)}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">
                                                <AdminInfoButton
                                                    count={item.items?.length ?? 0}
                                                    onClickAction={() => setReceiptDetailRow(item)}
                                                />  
                                                </td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.comment || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-admin-text-secondary">
                                        <th className="px-4 py-3">Документ</th>
                                        <th className="px-4 py-3">Тип</th>
                                        <th className="px-4 py-3">Дата</th>
                                        <th className="px-4 py-3">Строки</th>
                                        <th className="px-4 py-3">Комментарий</th>
                                        <th className="px-4 py-3 text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {writeoffItems.map((item) => (
                                        <tr key={item.id} className="border-b last:border-b-0">
                                            <td className="px-4 py-3 font-medium">{`Списание #${item.document_no ?? item.id}`}</td>
                                            <td className="px-4 py-3">{item.type}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">{formatDate(item.written_off_at)}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.items?.length ?? 0}</td>
                                            <td className="px-4 py-3 text-xs text-admin-text-secondary">{item.comment || "—"}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => setWriteoffDetailRow(item)}
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
            )}

            {receiptDetailRow ? (
                <ReportDetailsModal
                    title={`Приход #${receiptDetailRow.document_no ?? receiptDetailRow.id}`}
                    subtitle={`${receiptDetailRow.supplier_name} · ${formatDate(receiptDetailRow.received_at)}`}
                    rows={(receiptDetailRow.items ?? []).map((item) => ({
                        id: item.id,
                        product_name: item.product_name,
                        variant_title: item.variant_title,
                        qty: item.qty,
                        price: item.supplier_price,
                        line_total: item.line_total ?? null,
                    }))}
                    onCloseAction={() => setReceiptDetailRow(null)}
                />
            ) : null}

            {writeoffDetailRow ? (
                <ReportDetailsModal
                    title={`Списание #${writeoffModalDoc?.document_no ?? writeoffDetailRow.id}`}
                    subtitle={`${writeoffModalDoc?.type ?? writeoffDetailRow.type} · ${formatDate(writeoffModalDoc?.written_off_at ?? writeoffDetailRow.written_off_at)} · ${getStockWriteoffStatusLabel(writeoffModalDoc?.status ?? writeoffDetailRow.status)}`}
                    rows={mapWriteoffDetailRows(writeoffModalDoc)}
                    loading={writeoffDetailLoading}
                    showWriteoffSourceColumn
                    onCloseAction={() => setWriteoffDetailRow(null)}
                    footer={
                        <div className="flex flex-col gap-3">
                            {writeoffModalError ? (
                                <AdminFeedbackMessage
                                    type="error"
                                    message={writeoffModalError}
                                    onCloseAction={() => setWriteoffModalError("")}
                                />
                            ) : null}
                            {writeoffModalDoc?.status === STOCK_WRITEOFF_STATUS.REVERSED ? (
                                <p className="text-sm text-admin-text-secondary">Списание отменено, остатки на физических складах восстановлены.</p>
                            ) : null}
                            {writeoffCanReverse ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        disabled={writeoffReverseBusy || writeoffDetailLoading}
                                        onClick={() => {
                                            void (async () => {
                                                setWriteoffReverseBusy(true);
                                                setWriteoffModalError("");
                                                try {
                                                    await reverseStockWriteoff(writeoffDetailRow.id);
                                                    setWriteoffDetailRow(null);
                                                    if (activeTab === "writeoffs") {
                                                        try {
                                                            await loadWriteoffs();
                                                        } catch {
                                                            /* ignore */
                                                        }
                                                    }
                                                } catch (e) {
                                                    let msg = e instanceof Error ? e.message : "Не удалось отменить списание";
                                                    try {
                                                        const parsed = JSON.parse(msg) as {
                                                            message?: string;
                                                            errors?: { writeoff?: string[] };
                                                        };
                                                        msg =
                                                            parsed.message ||
                                                            parsed.errors?.writeoff?.[0] ||
                                                            msg;
                                                    } catch {
                                                        /* raw text */
                                                    }
                                                    setWriteoffModalError(msg);
                                                } finally {
                                                    setWriteoffReverseBusy(false);
                                                }
                                            })();
                                        }}
                                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                                    >
                                        {writeoffReverseBusy ? "Отмена…" : "Отменить списание"}
                                    </button>
                                    <span className="text-xs text-admin-text-secondary">
                                        Вернёт количество на физические склады. Движения на складе поставщика не меняются.
                                    </span>
                                </div>
                            ) : null}
                            {!writeoffDetailLoading &&
                            writeoffModalDoc?.status === STOCK_WRITEOFF_STATUS.POSTED &&
                            !writeoffCanReverse &&
                            !writeoffModalError ? (
                                <p className="text-xs text-admin-text-secondary">
                                    Отмена недоступна: нет движений для отката вне склада поставщика.
                                </p>
                            ) : null}
                        </div>
                    }
                />
            ) : null}
        </AdminPageCard>
    );
}
