"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListOrdered, Printer, FilterX, Database, RefreshCw, ShoppingCart, Truck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    fetchOrders,
    sendVeterTickets,
    syncLegacyCustomersAndOrders,
    syncVeterTicketStatuses,
} from "@/lib/admin-orders-api";
import { fetchAttributeBindingOptions } from "@/lib/admin-attributes-api";
import { fetchSupplierOrderReservationsReport, type SupplierOrderReservationRow } from "@/lib/admin-warehouse-api";
import type { OrderData, OrdersResponse } from "@/types/orders";
import { getOrderStatusLabel, isVeterSendAllowedStatus } from "@/constants/order-statuses";
import AdminOrdersTable from "@/components/admin/admin-orders-table";
import AdminOrdersDateRangeButton, {
    type AdminOrdersDateRangeButtonHandle,
    getAdminOrdersDateFilterLabel,
} from "@/components/admin/orders/admin-orders-date-range-button";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
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

const iconBtnClassName =
    "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10";

const iconClassName = "h-4 w-4 md:h-[1.125rem] md:w-[1.125rem]";

function OrdersIconActionButton({
    label,
    disabled,
    onClick,
    badge,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    badge?: number;
    children: ReactNode;
}) {
    const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

    const showTip = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        setTip({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    };

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                aria-label={label}
                onClick={onClick}
                onMouseEnter={(e) => showTip(e.currentTarget)}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => showTip(e.currentTarget)}
                onBlur={() => setTip(null)}
                className={iconBtnClassName}
            >
                {children}
                {badge != null && badge > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-admin-primary px-0.5 text-[9px] font-semibold leading-none text-white md:h-4 md:min-w-4 md:px-1 md:text-[10px]">
                        {badge > 99 ? "99+" : badge}
                    </span>
                ) : null}
            </button>
            {tip && typeof document !== "undefined"
                ? createPortal(
                      <span
                          role="tooltip"
                          className="pointer-events-none fixed z-[9999] -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
                          style={{ left: tip.x, top: tip.y }}
                      >
                          {label}
                      </span>,
                      document.body,
                  )
                : null}
        </>
    );
}
export default function AdminOrdersPage() {
    const router = useRouter();
    const searchParamsFromUrl = useSearchParams();
    const [activeTab, setActiveTab] = useState<OrdersTab>("orders");

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersMeta, setOrdersMeta] = useState<OrdersResponse["meta"] | null>(null);
    const [ordersPage, setOrdersPage] = useState(1);
    const [ordersPerPage, setOrdersPerPage] = useState<(typeof ORDERS_PER_PAGE_OPTIONS)[number]>(25);
    const [orderProducts, setOrderProducts] = useState<SupplierOrderReservationRow[]>([]);
    const [orderProductsFilterOrders, setOrderProductsFilterOrders] = useState<number[]>([]);
    const [orderFilter, setOrderFilter] = useState<number | "">("");
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptCountryOptions, setReceiptCountryOptions] = useState<string[]>([]);
    const [receiptOptionsLoading, setReceiptOptionsLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<AdminToast | null>(null);
    const [veterSending, setVeterSending] = useState(false);
    const [veterStatusSyncing, setVeterStatusSyncing] = useState(false);
    const [legacySyncing, setLegacySyncing] = useState(false);

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
    const hasDateFilter = Boolean(periodFilter || dateFrom.trim() || dateTo.trim());
    const hasStatusFilter = Boolean(statusFilter.trim());
    const statusFilterLabel = hasStatusFilter ? getOrderStatusLabel(statusFilter) : "";

    const clearDateFilter = () => {
        setPeriodFilter("");
        setDateFrom("");
        setDateTo("");
    };

    const clearStatusFilter = () => {
        setStatusFilter("");
    };

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const selectedOrders = useMemo(
        () => orders.filter((order) => selectedOrderIds.includes(order.id)),
        [orders, selectedOrderIds],
    );

    const veterSendCandidateCount = useMemo(
        () =>
            selectedOrders.filter((order) => {
                if (order.shipment_id?.trim()) {
                    return false;
                }
                if (!isVeterSendAllowedStatus(order.status)) {
                    return false;
                }
                const method = order.delivery_method ?? "";
                return method === "minsk_courier" || method === "belarus_courier";
            }).length,
        [selectedOrders],
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
                    order_id: typeof orderFilter === "number" ? orderFilter : undefined,
                });
                setOrderProducts(response.data ?? []);
                if (Array.isArray(response.filter_orders)) {
                    setOrderProductsFilterOrders(response.filter_orders);
                }
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить товары для заказа" });
            } finally {
                setLoading(false);
            }
        };

        void loadOrderProducts();
    }, [activeTab, orderFilter]);

    const handleReset = () => {
        setSearchInput("");
        setStatusFilter("");
        setPeriodFilter("");
        setDateFrom("");
        setDateTo("");
        setOrderFilter("");
        setSelectedOrderIds([]);
        setOrdersPage(1);
        setToast(null);
    };

    const hasOrdersFilters = Boolean(
        searchInput.trim() || statusFilter || periodFilter || dateFrom.trim() || dateTo.trim(),
    );
    const hasProductsFilters = Boolean(orderFilter !== "" && orderFilter != null);

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

    const handleVeterSend = async () => {
        const candidateIds = selectedOrders
            .filter((order) => {
                if (order.shipment_id?.trim()) {
                    return false;
                }
                if (!isVeterSendAllowedStatus(order.status)) {
                    return false;
                }
                const method = order.delivery_method ?? "";
                return method === "minsk_courier" || method === "belarus_courier";
            })
            .map((order) => order.id);

        if (candidateIds.length === 0) {
            setToast({
                type: "error",
                message:
                    "Нет заказов для отправки (курьер Минск/РБ, без ID отправки, статус: новый / подтверждён / в обработке / предзаказ)",
            });
            return;
        }

        const ok = window.confirm(
            `Отправить в курьерскую службу Ветер ${candidateIds.length} заказ(ов)?\n#${candidateIds.join(", #")}`,
        );
        if (!ok) {
            return;
        }

        setVeterSending(true);
        setToast(null);
        try {
            const response = await sendVeterTickets(candidateIds);
            const data = response.data;
            const sent = data.sent ?? [];
            const failed = data.failed ?? [];
            const invalid = data.invalid ?? [];
            const skipped = data.skipped ?? [];

            if (sent.length > 0) {
                const byId = new Map(
                    sent.map((row) => [
                        row.order_id,
                        { shipment_id: row.shipment_id, status: row.status || "in_delivery" },
                    ]),
                );
                setOrders((prev) =>
                    prev.map((order) => {
                        const hit = byId.get(order.id);
                        return hit
                            ? { ...order, shipment_id: hit.shipment_id, status: hit.status }
                            : order;
                    }),
                );
                setSelectedOrderIds((prev) => prev.filter((id) => !byId.has(id)));
            }

            const failCount = failed.length + invalid.length;
            const formatDetails = (rows: { order_id: number; reason: string }[]) =>
                rows
                    .slice(0, 3)
                    .map((row) => `#${row.order_id}: ${row.reason}`)
                    .join("; ") + (rows.length > 3 ? "…" : "");
            const auditHint = failed.length > 0 ? " (см. Аудит)" : "";

            if (failCount === 0 && sent.length > 0) {
                setToast({
                    type: "success",
                    message:
                        response.message ||
                        `Отправлено в Ветер: ${sent.length}` +
                            (skipped.length > 0 ? `, пропущено: ${skipped.length}` : ""),
                });
                return;
            }

            if (sent.length > 0 && failCount > 0) {
                setToast({
                    type: "error",
                    message: `Частично: отправлено ${sent.length}, ошибок ${failCount}. ${formatDetails([
                        ...failed,
                        ...invalid,
                    ])}${auditHint}`,
                });
                return;
            }

            if (failCount > 0) {
                setToast({
                    type: "error",
                    message: `Не удалось отправить (${failCount}). ${formatDetails([
                        ...failed,
                        ...invalid,
                    ])}${auditHint}`,
                });
                return;
            }

            if (skipped.length > 0) {
                setToast({
                    type: "error",
                    message: `Пропущено (${skipped.length}). ${formatDetails(skipped)}`,
                });
                return;
            }

            setToast({
                type: "error",
                message: response.message || "Нечего отправлять",
            });
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка отправки в Ветер",
            });
        } finally {
            setVeterSending(false);
        }
    };

    const handleVeterStatusSync = async () => {
        const ok = window.confirm(
            "Обновить статусы курьерской службы для всех заказов «В доставке» с ID отправки?",
        );
        if (!ok) {
            return;
        }

        setVeterStatusSyncing(true);
        setToast(null);
        try {
            const response = await syncVeterTicketStatuses();
            const failed = response.data.failed ?? [];
            const updated = response.data.updated ?? [];

            if (failed.length === 0) {
                setToast({
                    type: "success",
                    message:
                        response.message ||
                        `Статусы Ветер обновлены: ${updated.length}`,
                });
            } else if (updated.length > 0) {
                setToast({
                    type: "error",
                    message: `Частично: обновлено ${updated.length}, ошибок ${failed.length}. ${failed
                        .slice(0, 2)
                        .map((row) => `#${row.order_id}: ${row.reason}`)
                        .join("; ")}${failed.length > 2 ? "…" : ""} (см. Аудит)`,
                });
            } else {
                setToast({
                    type: "error",
                    message: `Не удалось обновить статусы (${failed.length}). ${failed
                        .slice(0, 2)
                        .map((row) => `#${row.order_id}: ${row.reason}`)
                        .join("; ")}${failed.length > 2 ? "…" : ""} (см. Аудит)`,
                });
            }

            if (updated.length > 0) {
                const byId = new Map(
                    updated.map((row) => [row.order_id, row.shipment_status]),
                );
                setOrders((prev) =>
                    prev.map((order) => {
                        if (!byId.has(order.id)) {
                            return order;
                        }
                        return {
                            ...order,
                            shipment_status: byId.get(order.id) ?? order.shipment_status,
                            shipment_status_at: new Date().toISOString(),
                        };
                    }),
                );
            }
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message:
                    error instanceof Error ? error.message : "Ошибка обновления статусов Ветер",
            });
        } finally {
            setVeterStatusSyncing(false);
        }
    };

    const handleLegacySync = async () => {
        const ok = window.confirm(
            "Синхронизировать клиентов и заказы с легаси MySQL?\nБудут импортированы только записи после последнего legacy ID в наших map.",
        );
        if (!ok) {
            return;
        }

        setLegacySyncing(true);
        setToast(null);
        try {
            const response = await syncLegacyCustomersAndOrders();
            const manualRange = Boolean(dateFrom.trim()) || Boolean(dateTo.trim());
            const ordersResponse = await fetchOrders({
                search: debouncedSearch,
                status: statusFilter,
                period: manualRange ? undefined : periodFilter || undefined,
                from: dateFrom.trim() || undefined,
                to: dateTo.trim() || undefined,
                page: 1,
                per_page: ordersPerPage,
            });
            setOrdersPage(1);
            setOrders(ordersResponse.data);
            setOrdersMeta(ordersResponse.meta);
            lastOrdersFetchSigRef.current = `${ordersListKey}|1`;
            setToast({
                type: "success",
                message: response.message || "Синхронизация с легаси завершена",
            });
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка синхронизации с легаси",
            });
        } finally {
            setLegacySyncing(false);
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
                            ? "Поиск по номеру заказа, ID отправки, имени или телефону"
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
                        <div className="flex flex-nowrap items-center gap-1.5 md:flex-wrap md:items-end md:justify-between md:gap-3">
                            <div className="flex shrink-0 items-center gap-1 md:gap-2">
                                <OrdersIconActionButton
                                    label={receiptOptionsLoading ? "Загрузка…" : "Печать"}
                                    disabled={selectedOrders.length === 0 || receiptOptionsLoading}
                                    onClick={handleOpenReceiptModal}
                                    badge={selectedOrders.length}
                                >
                                    <Printer className={iconClassName} strokeWidth={2} />
                                </OrdersIconActionButton>
                                <OrdersIconActionButton
                                    label={
                                        veterSending
                                            ? "Отправка…"
                                            : `Отправить в курьерскую службу${
                                                  veterSendCandidateCount > 0
                                                      ? ` (${veterSendCandidateCount})`
                                                      : ""
                                              }`
                                    }
                                    disabled={
                                        veterSendCandidateCount === 0 ||
                                        veterSending ||
                                        veterStatusSyncing ||
                                        legacySyncing
                                    }
                                    onClick={() => void handleVeterSend()}
                                    badge={veterSendCandidateCount}
                                >
                                    <Truck className={iconClassName} strokeWidth={2} />
                                </OrdersIconActionButton>
                                <OrdersIconActionButton
                                    label={
                                        veterStatusSyncing
                                            ? "Обновление…"
                                            : "Обновить статусы курьерской службы"
                                    }
                                    disabled={veterStatusSyncing || veterSending || legacySyncing}
                                    onClick={() => void handleVeterStatusSync()}
                                >
                                    <RefreshCw
                                        className={`${iconClassName}${veterStatusSyncing ? " animate-spin" : ""}`}
                                        strokeWidth={2}
                                    />
                                </OrdersIconActionButton>
                                <OrdersIconActionButton
                                    label={
                                        legacySyncing ? "Синхронизация…" : "Синхронизировать с легаси"
                                    }
                                    disabled={legacySyncing || veterSending || veterStatusSyncing}
                                    onClick={() => void handleLegacySync()}
                                >
                                    <Database
                                        className={`${iconClassName}${legacySyncing ? " animate-pulse" : ""}`}
                                        strokeWidth={2}
                                    />
                                </OrdersIconActionButton>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 md:flex-none md:flex-wrap md:items-end md:gap-2">
                                <div className="min-w-0 flex-1 md:flex-none">
                                    <AdminSearchInput
                                        value={searchInput}
                                        onChangeAction={setSearchInput}
                                        placeholder="ID, ID отправки, имя, телефон"
                                    />
                                </div>

                                {hasOrdersFilters ? (
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className={iconBtnClassName}
                                        title="Сбросить фильтры"
                                        aria-label="Сбросить фильтры"
                                    >
                                        <FilterX className={iconClassName} strokeWidth={2} />
                                    </button>
                                ) : null}
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
                    <div className="flex w-full min-w-0 flex-wrap items-end justify-end gap-2">
                        <select
                            value={orderFilter}
                            onChange={(e) => setOrderFilter(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border border-admin-border bg-white px-3 py-2.5 text-sm"
                        >
                            <option value="">Все заказы</option>
                            {orderProductsFilterOrders.map((id) => (
                                <option key={id} value={id}>
                                    #{id}
                                </option>
                            ))}
                        </select>

                        {hasProductsFilters ? (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                title="Сбросить фильтры"
                                aria-label="Сбросить фильтры"
                            >
                                <FilterX size={16} strokeWidth={2} />
                            </button>
                        ) : null}
                    </div>
                )}
            </AdminTableToolbar>

            {activeTab === "orders" && (hasDateFilter || hasStatusFilter) ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {hasStatusFilter ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-admin-border bg-admin-muted px-3 py-1 text-xs text-admin-text">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 text-admin-text-secondary">Статус:</span>
                                <span className="max-w-[16rem] truncate font-medium">{statusFilterLabel}</span>
                            </span>
                            <button
                                type="button"
                                onClick={clearStatusFilter}
                                className="ml-0.5 inline-flex shrink-0 rounded-full p-0.5 text-admin-text-secondary transition hover:bg-gray-200 hover:text-admin-text"
                                aria-label="Сбросить фильтр по статусу"
                                title="Сбросить"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        </span>
                    ) : null}
                    {hasDateFilter ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-admin-border bg-admin-muted px-3 py-1 text-xs text-admin-text">
                            <button
                                type="button"
                                onClick={() => dateFilterRef.current?.open()}
                                className="inline-flex min-w-0 items-center gap-1.5 text-left transition hover:text-admin-primary"
                                title="Изменить фильтр по дате доставки"
                            >
                                <span className="shrink-0 text-admin-text-secondary">Дата доставки:</span>
                                <span className="max-w-[16rem] truncate font-medium">{dateFilterSummary}</span>
                            </button>
                            <button
                                type="button"
                                onClick={clearDateFilter}
                                className="ml-0.5 inline-flex shrink-0 rounded-full p-0.5 text-admin-text-secondary transition hover:bg-gray-200 hover:text-admin-text"
                                aria-label="Сбросить фильтр по дате доставки"
                                title="Сбросить"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        </span>
                    ) : null}
                </div>
            ) : null}

            {loading && (
                <AdminLoadingState text={activeTab === "orders" ? "Загрузка заказов…" : "Загрузка…"} />
            )}

            {!loading && activeTab === "orders" && ordersMeta !== null && (
                <>
                    <AdminOrdersTable
                        initialOrders={orders}
                        searchQuery={searchInput}
                        onSuccessMessageAction={(message) => setToast({ type: "success", message })}
                        onErrorMessageAction={(message) => setToast({ type: "error", message })}
                        onDateFilterHeaderClickAction={() => dateFilterRef.current?.open()}
                        statusFilter={statusFilter}
                        onStatusFilterChangeAction={setStatusFilter}
                        selectedOrderIds={selectedOrderIds}
                        onSelectedOrderIdsChangeAction={setSelectedOrderIds}
                    />
                    {ordersMeta.total === 0 ? (
                        <AdminEmptyState
                            title="Заказы не найдены"
                            description="Попробуйте изменить поиск, статус или фильтр по дате доставки."
                        />
                    ) : (
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
                    )}
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
                                    <td className="px-4 py-3 align-top font-medium">#{row.order_id}</td>
                                    <td className="px-4 py-3 align-top">
                                        <div>{row.product_name ?? "—"}</div>
                                        <div className="text-xs text-admin-text-secondary">{row.variant_title ?? "—"}</div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-col">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`name-${i}`} className="block h-5 truncate leading-5">
                                                    {s.name ?? "—"}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-col">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`prod-${i}`} className="block h-5 truncate leading-5" title={s.product_name ?? undefined}>
                                                    {s.product_name ?? "—"}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-col">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`code-${i}`} className="block h-5 truncate leading-5">
                                                    {s.code ?? "—"}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-col">
                                            {row.suppliers.map((s, i) => (
                                                <span key={`price-${i}`} className="block h-5 truncate leading-5">
                                                    {s.price ?? "—"}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">{row.qty}</td>
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