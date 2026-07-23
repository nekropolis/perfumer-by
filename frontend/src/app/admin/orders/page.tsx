"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListOrdered, Printer, ShoppingCart } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchOrders } from "@/lib/admin-orders-api";
import { fetchProducts, type ProductAdminItem } from "@/lib/admin-products-api";
import { fetchAttributeBindingOptions } from "@/lib/admin-attributes-api";
import { fetchSupplierOrderReservationsReport, type SupplierOrderReservationRow } from "@/lib/admin-warehouse-api";
import type { OrderData, OrdersResponse } from "@/types/orders";
import { ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrdersTable from "@/components/admin/admin-orders-table";
import AdminOrdersDateRangeButton, {
    type AdminOrdersDateRangeButtonHandle,
    getAdminOrdersDateFilterLabel,
} from "@/components/admin/orders/admin-orders-date-range-button";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import useDebouncedValue from "@/hooks/use-debounced-value";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";
import AdminOrderReceiptsModal from "@/components/admin/orders/admin-order-receipts-modal";
import {AdminToast} from "@/types/admin";

type OrdersTab = "orders" | "order_products";

const ORDER_PERIOD_OPTIONS = [
    { value: "today", label: "Сегодня" },
    { value: "week", label: "Последние 7 дней" },
    { value: "month", label: "Текущий месяц" },
    { value: "year", label: "Текущий год" },
];

const ORDERS_PER_PAGE_OPTIONS = [25, 50, 100] as const;

const ORDER_TABS: AdminRichTabItem<OrdersTab>[] = [
    {
        id: "orders",
        label: "Заказы",
        description: "Список заказов и статусы",
        icon: ListOrdered,
    },
    {
        id: "order_products",
        label: "Товары для заказов",
        description: "Все товары из новых заказов и заказов в обработке",
        icon: ShoppingCart,
    },
];

export default function AdminOrdersPage() {
    const router = useRouter();
    const searchParamsFromUrl = useSearchParams();
    const [activeTab, setActiveTab] = useState<OrdersTab>("orders");

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersMeta, setOrdersMeta] = useState<OrdersResponse["meta"] | null>(null);
    const [ordersPage, setOrdersPage] = useState(1);
    const [ordersPerPage, setOrdersPerPage] = useState<(typeof ORDERS_PER_PAGE_OPTIONS)[number]>(25);
    const [orderProducts, setOrderProducts] = useState<SupplierOrderReservationRow[]>([]);
    const [products, setProducts] = useState<ProductAdminItem[]>([]);
    const [productFilter, setProductFilter] = useState<number | "">("");
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptCountryOptions, setReceiptCountryOptions] = useState<string[]>([]);
    const [receiptOptionsLoading, setReceiptOptionsLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [statusFilter, setStatusFilter] = useState(
        () => searchParamsFromUrl.get("status") ?? "",
    );
    const [periodFilter, setPeriodFilter] = useState(
        () => searchParamsFromUrl.get("period") ?? "",
    );
    const [dateFrom, setDateFrom] = useState(() => searchParamsFromUrl.get("from") ?? "");
    const [dateTo, setDateTo] = useState(() => searchParamsFromUrl.get("to") ?? "");

    const dateFilterRef = useRef<AdminOrdersDateRangeButtonHandle>(null);
    const dateFilterSummary = useMemo(
        () => getAdminOrdersDateFilterLabel(ORDER_PERIOD_OPTIONS, { period: periodFilter, dateFrom, dateTo }),
        [periodFilter, dateFrom, dateTo],
    );

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const selectedOrders = useMemo(
        () => orders.filter((order) => selectedOrderIds.includes(order.id)),
        [orders, selectedOrderIds],
    );

    const ordersListKey = useMemo(
        () =>
            `${debouncedSearch}|${statusFilter}|${periodFilter}|${dateFrom.trim()}|${dateTo.trim()}|${ordersPerPage}`,
        [debouncedSearch, statusFilter, periodFilter, dateFrom, dateTo, ordersPerPage],
    );

    const prevOrdersListKeyRef = useRef<string | null>(null);
    const lastOrdersFetchSigRef = useRef<string>("");

    useEffect(() => {
        if (activeTab !== "orders") {
            lastOrdersFetchSigRef.current = "";
            prevOrdersListKeyRef.current = null;
            return;
        }

        const listKeyChanged =
            prevOrdersListKeyRef.current !== null && prevOrdersListKeyRef.current !== ordersListKey;
        prevOrdersListKeyRef.current = ordersListKey;

        const pageForRequest = listKeyChanged ? 1 : ordersPage;
        if (listKeyChanged && ordersPage !== 1) {
            setOrdersPage(1);
        }

        const fetchSig = `${ordersListKey}|${pageForRequest}`;
        if (lastOrdersFetchSigRef.current === fetchSig) {
            return;
        }
        lastOrdersFetchSigRef.current = fetchSig;

        let cancelled = false;

        const loadOrders = async () => {
            try {
                setLoading(true);
                setToast(null);

                const manualRange = Boolean(dateFrom.trim()) || Boolean(dateTo.trim());
                const response = await fetchOrders({
                    search: debouncedSearch,
                    status: statusFilter,
                    period: manualRange ? undefined : periodFilter || undefined,
                    from: dateFrom.trim() || undefined,
                    to: dateTo.trim() || undefined,
                    page: pageForRequest,
                    per_page: ordersPerPage,
                });

                if (cancelled) {
                    return;
                }

                setOrders(response.data);
                setOrdersMeta(response.meta);
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    setToast({ type: "error", message: "Не удалось загрузить заказы" });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadOrders();

        return () => {
            cancelled = true;
            /** Иначе при Strict Mode второй прогон увидит тот же sig и выйдет до fetch — loading останется true. */
            lastOrdersFetchSigRef.current = "";
        };
    }, [
        activeTab,
        ordersListKey,
        ordersPage,
        debouncedSearch,
        statusFilter,
        periodFilter,
        dateFrom,
        dateTo,
        ordersPerPage,
    ]);

    useEffect(() => {
        setSearchInput(searchParamsFromUrl.get("search") ?? "");
        setStatusFilter(searchParamsFromUrl.get("status") ?? "");
        setPeriodFilter(searchParamsFromUrl.get("period") ?? "");
        setDateFrom(searchParamsFromUrl.get("from") ?? "");
        setDateTo(searchParamsFromUrl.get("to") ?? "");
    }, [searchParamsFromUrl]);

    useEffect(() => {
        if (searchParamsFromUrl.get("created") === "1") {
            setToast({ type: "success", message: "Заказ создан" });
            router.replace("/admin/orders");
            return;
        }
        if (searchParamsFromUrl.get("updated") === "1") {
            setToast({ type: "success", message: "Заказ сохранён" });
            router.replace("/admin/orders");
        }
    }, [searchParamsFromUrl, router]);

    useEffect(() => {
        const visibleOrderIds = new Set(orders.map((order) => order.id));
        setSelectedOrderIds((prev) => prev.filter((id) => visibleOrderIds.has(id)));
    }, [orders]);

    useEffect(() => {
        if (activeTab !== "order_products") {
            return;
        }

        const loadOrderProducts = async () => {
            try {
                setLoading(true);
                setToast(null);
                const response = await fetchSupplierOrderReservationsReport({
                    page: 1,
                    product_id: typeof productFilter === "number" ? productFilter : undefined,
                });
                setOrderProducts(response.data ?? []);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить товары для заказа" });
            } finally {
                setLoading(false);
            }
        };

        void loadOrderProducts();
    }, [activeTab, productFilter]);

    useEffect(() => {
        const loadProducts = async () => {
            try {
                const response = await fetchProducts({ page: 1 });
                setProducts(response.data ?? []);
            } catch (error) {
                console.error(error);
            }
        };
        void loadProducts();
    }, []);

    const handleReset = () => {
        setSearchInput("");
        setStatusFilter("");
        setPeriodFilter("");
        setDateFrom("");
        setDateTo("");
        setProductFilter("");
        setSelectedOrderIds([]);
        setOrdersPage(1);
        setToast(null);
    };

    const handleOpenReceiptModal = async () => {
        if (selectedOrders.length === 0) {
            setToast({ type: "error", message: "Выберите заказы для печати" });
            return;
        }

        try {
            setReceiptOptionsLoading(true);
            setToast(null);
            const response = await fetchAttributeBindingOptions();
            const countryAttribute = response.data.find(
                (attribute) => attribute.name.trim().toLocaleLowerCase("ru-RU") === "страна тм",
            );
            setReceiptCountryOptions(countryAttribute?.options.map((option) => option.name) ?? []);
            setReceiptModalOpen(true);
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось загрузить справочник стран" });
        } finally {
            setReceiptOptionsLoading(false);
        }
    };

    return (
        <AdminPageCard>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-admin-text sm:text-2xl">
                        {activeTab === "orders" ? "Заказы" : "Товары для заказов"}
                    </h2>
                    <p className="mt-0.5 text-sm text-admin-text-secondary">
                        {activeTab === "orders"
                            ? "Поиск по номеру заказа, имени клиента или телефону"
                            : "Все товары из новых заказов и заказов в обработке"}
                    </p>
                </div>
            </div>

            <AdminRichTabs
                items={ORDER_TABS}
                activeTab={activeTab}
                onChangeAction={setActiveTab}
            />

            <AdminTableToolbar>
                {activeTab === "orders" ? (
                    <div className="flex w-full min-w-0 flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                                <AdminSearchInput
                                    value={searchInput}
                                    onChangeAction={setSearchInput}
                                    placeholder="ID, имя, телефон"
                                />

                                <AdminFilterSelect
                                    value={statusFilter}
                                    onChangeAction={setStatusFilter}
                                    options={ORDER_STATUS_OPTIONS}
                                    placeholder="Все статусы"
                                />
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-end">
                                <button
                                    type="button"
                                    onClick={handleOpenReceiptModal}
                                    disabled={selectedOrders.length === 0 || receiptOptionsLoading}
                                    className="inline-flex items-center gap-2 rounded-lg border border-admin-border bg-white px-4 py-2.5 text-sm transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Печать товарных чеков"
                                >
                                    <Printer size={16} />
                                    {receiptOptionsLoading ? "Загрузка..." : "Печать"}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="rounded-lg border border-admin-border bg-white px-4 py-2.5 text-sm transition hover:bg-admin-muted"
                                >
                                    Сбросить
                                </button>
                            </div>
                        </div>

                        <AdminOrdersDateRangeButton
                            ref={dateFilterRef}
                            hideTrigger
                            presets={ORDER_PERIOD_OPTIONS}
                            value={{ period: periodFilter, dateFrom, dateTo }}
                            onApplyAction={(next) => {
                                setPeriodFilter(next.period);
                                setDateFrom(next.dateFrom);
                                setDateTo(next.dateTo);
                            }}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <select
                            value={productFilter}
                            onChange={(e) => setProductFilter(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border border-admin-border bg-white px-3 py-2.5 text-sm"
                        >
                            <option value="">Все товары</option>
                            {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={handleReset}
                            className="shrink-0 self-start rounded-lg border border-admin-border bg-white px-4 py-2.5 text-sm transition hover:bg-admin-muted sm:self-end"
                        >
                            Сбросить
                        </button>
                    </div>
                )}
            </AdminTableToolbar>

            {loading && (
                <AdminLoadingState text={activeTab === "orders" ? "Загрузка заказов…" : "Загрузка…"} />
            )}

            {!loading && activeTab === "orders" && ordersMeta !== null && ordersMeta.total === 0 && (
                <AdminEmptyState
                    title="Заказы не найдены"
                    description="Попробуйте изменить поиск, статус или фильтр по дате создания."
                />
            )}

            {!loading && activeTab === "orders" && ordersMeta !== null && ordersMeta.total > 0 && (
                <>
                    <AdminOrdersTable
                        initialOrders={orders}
                        searchQuery={searchInput}
                        onSuccessMessageAction={(message) => setToast({ type: "success", message })}
                        onErrorMessageAction={(message) => setToast({ type: "error", message })}
                        dateFilterSummary={dateFilterSummary}
                        onDateFilterHeaderClickAction={() => dateFilterRef.current?.open()}
                        selectedOrderIds={selectedOrderIds}
                        onSelectedOrderIdsChangeAction={setSelectedOrderIds}
                    />
                    <div className="mt-4 flex flex-col gap-3 border-t border-admin-border pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
                            На странице
                            <select
                                value={ordersPerPage}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (v === 25 || v === 50 || v === 100) {
                                        setOrdersPerPage(v as (typeof ORDERS_PER_PAGE_OPTIONS)[number]);
                                    }
                                }}
                                className="rounded-lg border border-admin-border bg-white px-2 py-1.5 text-sm"
                            >
                                {ORDERS_PER_PAGE_OPTIONS.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="flex flex-1 justify-center sm:min-w-[12rem]">
                            <AdminPagination
                                currentPage={ordersMeta.current_page}
                                lastPage={ordersMeta.last_page}
                                onPrevAction={() => setOrdersPage((p) => Math.max(1, p - 1))}
                                onNextAction={() =>
                                    setOrdersPage((p) =>
                                        ordersMeta.current_page < ordersMeta.last_page ? p + 1 : p,
                                    )
                                }
                            />
                        </div>
                        <div className="text-sm text-admin-text-secondary sm:text-right">Всего заказов: {ordersMeta.total}</div>
                    </div>
                </>
            )}

                {!loading && activeTab === "order_products" && orderProducts.length === 0 && (
                    <AdminEmptyState
                        title="Товаров для заказа нет"
                        description="Нет товаров в новых заказах и заказах в обработке."
                    />
                )}

            {!loading && activeTab === "order_products" && orderProducts.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-admin-text-secondary">
                                <th className="px-4 py-3">Заказ</th>
                                <th className="px-4 py-3">Товар</th>
                                <th className="px-4 py-3">Поставщик</th>
                                <th className="px-4 py-3">Название у поставщика</th>
                                <th className="px-4 py-3">Код поставщика</th>
                                <th className="px-4 py-3">Цена поставщика</th>
                                <th className="px-4 py-3">Кол-во</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderProducts.map((row) => (
                                <tr key={row.id} className="border-b last:border-b-0">
                                    <td className="px-4 py-3 font-medium">#{row.order_id}</td>
                                    <td className="px-4 py-3">
                                        <div>{row.product_name ?? "—"}</div>
                                        <div className="text-xs text-admin-text-secondary">{row.variant_title ?? "—"}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`name-${i}`}>{s.name ?? "—"}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`prod-${i}`}>{s.product_name ?? "—"}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`code-${i}`}>{s.code ?? "—"}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`price-${i}`}>{s.price ?? "—"}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">{row.qty}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {toast && (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            )}

            {receiptModalOpen && selectedOrders.length > 0 ? (
                <AdminOrderReceiptsModal
                    orders={selectedOrders}
                    countryOptions={receiptCountryOptions}
                    onCloseAction={() => setReceiptModalOpen(false)}
                />
            ) : null}
        </AdminPageCard>
    );
}