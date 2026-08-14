"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListOrdered, Printer, FilterX, Database, RefreshCw, ShoppingCart, Truck, X, GripVertical, Check, Package, ClipboardList } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
    fetchOrders,
    sendVeterTickets,
    syncLegacyCustomersAndOrders,
    syncVeterTicketStatuses,
    updateOrderItemFulfillment,
    updateOrderStatus,
} from "@/lib/admin-orders-api";
import { fetchAttributeBindingOptions } from "@/lib/admin-attributes-api";
import { fetchSupplierOrderReservationsReport, type SupplierOrderReservationRow } from "@/lib/admin-warehouse-api";
import {
    addSupplierOrderDraftItem,
    confirmSupplierOrders,
    createSupplierOrderDraftFromReservations,
    deleteSupplierOrderDraftItem,
    exportSupplierOrderXlsx,
    fetchSupplierOrder,
    fetchSupplierOrderDraft,
    fetchSupplierOrders,
    updateSupplierOrderDraftItemQty,
    type DraftFromReservationsResult,
    type SupplierOrderDetail,
    type SupplierOrderDraftItem,
    type SupplierOrderListItem,
} from "@/lib/admin-supplier-orders-api";
import SupplierDraftAddProductModal from "@/components/admin/orders/supplier-draft-add-product-modal";
import { fetchOrderStatuses } from "@/lib/admin-order-statuses-api";
import type { OrderData, OrdersResponse } from "@/types/orders";
import {
    getOrderStatusColor,
    getOrderStatusLabel,
    isVeterSendAllowedStatus,
    solidColorPillStyle,
} from "@/constants/order-statuses";
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
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import { useOrderStatusOptions } from "@/hooks/use-order-status-options";
import { AdminToast } from "@/types/admin";
import { adminIconBtn } from "@/lib/admin-ui-classes";

type OrdersTab = "orders" | "order_products" | "supplier_order" | "supplier_orders";

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
        description: "Товары из заказов со статусами для закупки",
        icon: ShoppingCart,
    },
    {
        id: "supplier_order",
        label: "Заказ у поставщиков",
        description: "Черновик заявки к поставщикам",
        icon: Package,
    },
    {
        id: "supplier_orders",
        label: "Заказы поставщикам",
        description: "Сформированные заказы у поставщиков",
        icon: ClipboardList,
    },
];

const iconBtnClassName = `${adminIconBtn} md:h-10 md:w-10`;

const iconClassName = "h-4 w-4 md:h-[1.125rem] md:w-[1.125rem]";

const filterChipClassName =
    "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_3px_8px_rgba(15,23,42,0.12)]";

const SUPPLIER_PRODUCTS_COL_MIN_PX = 96;
const SUPPLIER_PRODUCTS_COL_MAX_PX = 480;
const ORDER_PRODUCTS_STATUS_MENU_WIDTH = "w-max max-w-[11.5rem]";
const ORDER_PRODUCTS_STATUS_TRIGGER_CLASS =
    "!h-5 !min-h-0 !w-auto !justify-start !rounded !px-1.5 !pr-4 !text-[9px] !tracking-wide [&>span]:!px-0 [&_svg]:!right-0.5 [&_svg]:!h-2.5 [&_svg]:!w-2.5";
const COMPLETED_ORDER_STATUSES = new Set(["done", "completed"]);

type SupplierProductTooltipState = {
    text: string;
    x: number;
    anchorTop: number;
    anchorBottom: number;
} | null;

function getSupplierProductTooltipPosition(element: HTMLElement): {
    x: number;
    anchorTop: number;
    anchorBottom: number;
} {
    const rect = element.getBoundingClientRect();
    const viewportPadding = 16;
    const tooltipHalfWidth = Math.min(192, Math.max(0, window.innerWidth / 2 - viewportPadding));

    return {
        x: Math.min(
            Math.max(rect.left + rect.width / 2, tooltipHalfWidth + viewportPadding),
            window.innerWidth - tooltipHalfWidth - viewportPadding,
        ),
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
    };
}

function positionSupplierProductTooltipEl(
    el: HTMLElement,
    anchor: { x: number; anchorTop: number; anchorBottom: number },
): void {
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const halfW = rect.width / 2;
    const left = Math.min(
        Math.max(anchor.x, halfW + pad),
        window.innerWidth - halfW - pad,
    );

    const spaceBelow = window.innerHeight - anchor.anchorBottom - pad;
    const spaceAbove = anchor.anchorTop - pad;
    const placeAbove = rect.height + 8 > spaceBelow && spaceAbove > spaceBelow;

    let top = placeAbove
        ? anchor.anchorTop - 8 - rect.height
        : anchor.anchorBottom + 8;

    if (top + rect.height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - pad - rect.height);
    }
    if (top < pad) {
        top = pad;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
}

function SupplierProductNameTooltip({
    tooltip,
    onMouseEnterAction,
    onMouseLeaveAction,
}: {
    tooltip: SupplierProductTooltipState;
    onMouseEnterAction: () => void;
    onMouseLeaveAction: () => void;
}) {
    const ref = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!tooltip || !el) {
            return;
        }
        positionSupplierProductTooltipEl(el, tooltip);
    }, [tooltip]);

    if (!tooltip || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] max-w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2.5 text-xs leading-snug text-admin-text shadow-2xl ring-1 ring-black/5"
            style={{
                left: tooltip.x,
                top: tooltip.anchorBottom + 8,
                visibility: "hidden",
            }}
            onMouseEnter={onMouseEnterAction}
            onMouseLeave={onMouseLeaveAction}
        >
            <div className="select-text font-medium text-admin-text">{tooltip.text}</div>
        </div>,
        document.body,
    );
}

function parseOrdersPerPage(raw: string | null): (typeof ORDERS_PER_PAGE_OPTIONS)[number] {
    const value = Number(raw);
    if (value === 25 || value === 50 || value === 100) {
        return value;
    }
    return 50;
}

function parseOrdersPage(raw: string | null): number {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function parseOrdersTab(raw: string | null): OrdersTab {
    if (raw === "order_products" || raw === "supplier_order" || raw === "supplier_orders") {
        return raw;
    }
    return "orders";
}

function comparePurchasePriceTone(
    atOrder: string | null,
    current: string | null,
): "higher" | "lower" | "same" | null {
    if (atOrder == null || current == null) {
        return null;
    }
    const a = Number(atOrder);
    const b = Number(current);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return null;
    }
    if (a > b) {
        return "higher";
    }
    if (a < b) {
        return "lower";
    }
    return "same";
}

function formatSupplierOrderDate(value: string | null): string {
    if (!value) {
        return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function parseOrderFilter(raw: string | null): number | "" {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : "";
}

/** Стабильный query для фильтров заказов (без one-shot флагов created/updated). */
function buildOrdersFiltersQuery(input: {
    search: string;
    status: string;
    period: string;
    from: string;
    to: string;
    page: number;
    perPage: number;
    tab: OrdersTab;
    orderId: number | "";
}): string {
    const params = new URLSearchParams();
    const search = input.search.trim();
    if (search) params.set("search", search);
    if (input.status.trim()) params.set("status", input.status.trim());
    if (input.period.trim()) params.set("period", input.period.trim());
    if (input.from.trim()) params.set("from", input.from.trim());
    if (input.to.trim()) params.set("to", input.to.trim());
    if (input.page > 1) params.set("page", String(input.page));
    if (input.perPage !== 25) params.set("per_page", String(input.perPage));
    if (input.tab !== "orders") params.set("tab", input.tab);
    if (typeof input.orderId === "number") params.set("order_id", String(input.orderId));
    return params.toString();
}

/** Обновить query без навигации Next.js — иначе searchParams мигают и список перезапрашивается. */
function replaceOrdersUrl(href: string): void {
    if (typeof window === "undefined") {
        return;
    }
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === href) {
        return;
    }
    window.history.replaceState(window.history.state, "", href);
}

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
    const pathname = usePathname();
    const searchParamsFromUrl = useSearchParams();
    const [activeTab, setActiveTab] = useState<OrdersTab>(() =>
        parseOrdersTab(searchParamsFromUrl.get("tab")),
    );

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersMeta, setOrdersMeta] = useState<OrdersResponse["meta"] | null>(null);
    const [ordersPage, setOrdersPage] = useState(() => parseOrdersPage(searchParamsFromUrl.get("page")));
    const [ordersPerPage, setOrdersPerPage] = useState<(typeof ORDERS_PER_PAGE_OPTIONS)[number]>(() =>
        parseOrdersPerPage(searchParamsFromUrl.get("per_page")),
    );
    const [orderProducts, setOrderProducts] = useState<SupplierOrderReservationRow[]>([]);
    const [orderProductsFilterOrders, setOrderProductsFilterOrders] = useState<number[]>([]);
    const [orderFilter, setOrderFilter] = useState<number | "">(() =>
        parseOrderFilter(searchParamsFromUrl.get("order_id")),
    );
    const [supplierProductsColWidth, setSupplierProductsColWidth] = useState<number | null>(null);
    const [supplierProductTooltip, setSupplierProductTooltip] = useState<SupplierProductTooltipState>(null);
    const [orderProductStatusCodes, setOrderProductStatusCodes] = useState<Set<string>>(() => new Set());
    const [orderProductsStatusSaving, setOrderProductsStatusSaving] = useState(false);
    const [orderProductsFulfillmentSavingKey, setOrderProductsFulfillmentSavingKey] = useState<string | null>(null);
    const [orderProductsStatusConfirm, setOrderProductsStatusConfirm] = useState<{
        orderId: number;
        nextStatus: string;
        kind: "done" | "cancelled";
    } | null>(null);
    const [supplierDraftItems, setSupplierDraftItems] = useState<SupplierOrderDraftItem[]>([]);
    const [supplierDraftReloadNonce, setSupplierDraftReloadNonce] = useState(0);
    const [supplierDraftForming, setSupplierDraftForming] = useState(false);
    const [supplierDraftConfirmOpen, setSupplierDraftConfirmOpen] = useState(false);
    const [supplierDraftConfirming, setSupplierDraftConfirming] = useState(false);
    const [supplierDraftQtySavingId, setSupplierDraftQtySavingId] = useState<number | null>(null);
    const [supplierOrdersList, setSupplierOrdersList] = useState<SupplierOrderListItem[]>([]);
    const [supplierOrdersPage, setSupplierOrdersPage] = useState(1);
    const [supplierOrdersMeta, setSupplierOrdersMeta] = useState<{
        current_page: number;
        last_page: number;
        total: number;
    } | null>(null);
    const [supplierOrdersReloadNonce, setSupplierOrdersReloadNonce] = useState(0);
    const [expandedSupplierOrderId, setExpandedSupplierOrderId] = useState<number | null>(null);
    const [expandedSupplierOrder, setExpandedSupplierOrder] = useState<SupplierOrderDetail | null>(null);
    const [expandedSupplierOrderLoading, setExpandedSupplierOrderLoading] = useState(false);
    const [supplierOrderExportingId, setSupplierOrderExportingId] = useState<number | null>(null);
    const [supplierDraftAddOpen, setSupplierDraftAddOpen] = useState(false);
    const [supplierDraftAdding, setSupplierDraftAdding] = useState(false);
    const [supplierDraftDeletingId, setSupplierDraftDeletingId] = useState<number | null>(null);
    const supplierProductsThRef = useRef<HTMLTableCellElement | null>(null);
    const supplierProductTooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { options: orderStatusOptions } = useOrderStatusOptions(true);
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptCountryOptions, setReceiptCountryOptions] = useState<string[]>([]);
    const [receiptOptionsLoading, setReceiptOptionsLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<AdminToast | null>(null);
    const [veterSending, setVeterSending] = useState(false);
    const [veterStatusSyncing, setVeterStatusSyncing] = useState(false);
    const [legacySyncing, setLegacySyncing] = useState(false);
    const [ordersReloadNonce, setOrdersReloadNonce] = useState(0);

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
    const urlQueryKey = searchParamsFromUrl.toString();

    const selectedOrders = useMemo(
        () => orders.filter((order) => selectedOrderIds.includes(order.id)),
        [orders, selectedOrderIds],
    );

    const orderProductsGrouped = useMemo(() => {
        const groups: { orderId: number; products: SupplierOrderReservationRow[] }[] = [];
        const indexByOrder = new Map<number, number>();
        for (const row of orderProducts) {
            const existing = indexByOrder.get(row.order_id);
            if (existing === undefined) {
                indexByOrder.set(row.order_id, groups.length);
                groups.push({ orderId: row.order_id, products: [row] });
            } else {
                groups[existing].products.push(row);
            }
        }
        return groups;
    }, [orderProducts]);

    const clearSupplierProductTooltipHideTimer = useCallback(() => {
        if (supplierProductTooltipHideTimerRef.current) {
            clearTimeout(supplierProductTooltipHideTimerRef.current);
            supplierProductTooltipHideTimerRef.current = null;
        }
    }, []);

    const showSupplierProductTooltip = useCallback(
        (text: string, element: HTMLElement) => {
            const trimmed = text.trim();
            if (!trimmed || trimmed === "—" || element.scrollWidth <= element.clientWidth + 1) {
                clearSupplierProductTooltipHideTimer();
                setSupplierProductTooltip(null);
                return;
            }
            clearSupplierProductTooltipHideTimer();
            setSupplierProductTooltip({
                text: trimmed,
                ...getSupplierProductTooltipPosition(element),
            });
        },
        [clearSupplierProductTooltipHideTimer],
    );

    const hideSupplierProductTooltip = useCallback(() => {
        clearSupplierProductTooltipHideTimer();
        setSupplierProductTooltip(null);
    }, [clearSupplierProductTooltipHideTimer]);

    const hideSupplierProductTooltipWithDelay = useCallback(() => {
        clearSupplierProductTooltipHideTimer();
        supplierProductTooltipHideTimerRef.current = setTimeout(() => {
            setSupplierProductTooltip(null);
            supplierProductTooltipHideTimerRef.current = null;
        }, 220);
    }, [clearSupplierProductTooltipHideTimer]);

    const onSupplierProductsColResizeStart = useCallback((event: ReactMouseEvent<HTMLSpanElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const measured = Math.round(supplierProductsThRef.current?.getBoundingClientRect().width ?? 168);
        const startX = event.clientX;
        const startWidth = measured;

        const onMove = (moveEvent: MouseEvent) => {
            const next = Math.min(
                SUPPLIER_PRODUCTS_COL_MAX_PX,
                Math.max(SUPPLIER_PRODUCTS_COL_MIN_PX, startWidth + (moveEvent.clientX - startX)),
            );
            setSupplierProductsColWidth(next);
        };

        const onUp = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, []);

    useEffect(() => {
        if (!supplierProductTooltip) {
            return;
        }

        const onScroll = () => hideSupplierProductTooltip();
        window.addEventListener("scroll", onScroll, true);
        return () => window.removeEventListener("scroll", onScroll, true);
    }, [supplierProductTooltip, hideSupplierProductTooltip]);

    useEffect(() => {
        return () => clearSupplierProductTooltipHideTimer();
    }, [clearSupplierProductTooltipHideTimer]);

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

        const fetchSig = `${ordersListKey}|${pageForRequest}|${ordersReloadNonce}`;
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
        ordersReloadNonce,
    ]);

    useEffect(() => {
        setSearchInput(searchParamsFromUrl.get("search") ?? "");
        setStatusFilter(searchParamsFromUrl.get("status") ?? "");
        setPeriodFilter(searchParamsFromUrl.get("period") ?? "");
        setDateFrom(searchParamsFromUrl.get("from") ?? "");
        setDateTo(searchParamsFromUrl.get("to") ?? "");
        setOrdersPage(parseOrdersPage(searchParamsFromUrl.get("page")));
        setOrdersPerPage(parseOrdersPerPage(searchParamsFromUrl.get("per_page")));
        setActiveTab(parseOrdersTab(searchParamsFromUrl.get("tab")));
        setOrderFilter(parseOrderFilter(searchParamsFromUrl.get("order_id")));
        // Только при реальном изменении query string — иначе сброс фильтра откатывается из старого URL.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- urlQueryKey отражает searchParamsFromUrl
    }, [urlQueryKey]);

    useEffect(() => {
        const nextQuery = buildOrdersFiltersQuery({
            search: searchInput,
            status: statusFilter,
            period: periodFilter,
            from: dateFrom,
            to: dateTo,
            page: ordersPage,
            perPage: ordersPerPage,
            tab: activeTab,
            orderId: orderFilter,
        });

        const liveQuery =
            typeof window !== "undefined"
                ? window.location.search.replace(/^\?/, "")
                : urlQueryKey;
        const currentParams = new URLSearchParams(liveQuery);
        currentParams.delete("created");
        currentParams.delete("updated");
        const currentQuery = buildOrdersFiltersQuery({
            search: currentParams.get("search") ?? "",
            status: currentParams.get("status") ?? "",
            period: currentParams.get("period") ?? "",
            from: currentParams.get("from") ?? "",
            to: currentParams.get("to") ?? "",
            page: parseOrdersPage(currentParams.get("page")),
            perPage: parseOrdersPerPage(currentParams.get("per_page")),
            tab: parseOrdersTab(currentParams.get("tab")),
            orderId: parseOrderFilter(currentParams.get("order_id")),
        });

        if (nextQuery === currentQuery) {
            return;
        }

        replaceOrdersUrl(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, [
        activeTab,
        dateFrom,
        dateTo,
        orderFilter,
        ordersPage,
        ordersPerPage,
        pathname,
        periodFilter,
        searchInput,
        statusFilter,
        urlQueryKey,
    ]);

    useEffect(() => {
        if (searchParamsFromUrl.get("created") === "1") {
            setToast({ type: "success", message: "Заказ создан" });
            const params = new URLSearchParams(urlQueryKey);
            params.delete("created");
            params.delete("updated");
            const qs = params.toString();
            replaceOrdersUrl(qs ? `${pathname}?${qs}` : pathname);
            return;
        }
        if (searchParamsFromUrl.get("updated") === "1") {
            setToast({ type: "success", message: "Заказ сохранён" });
            const params = new URLSearchParams(urlQueryKey);
            params.delete("created");
            params.delete("updated");
            const qs = params.toString();
            replaceOrdersUrl(qs ? `${pathname}?${qs}` : pathname);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- urlQueryKey отражает searchParamsFromUrl
    }, [urlQueryKey, pathname]);

    useEffect(() => {
        const visibleOrderIds = new Set(orders.map((order) => order.id));
        setSelectedOrderIds((prev) => prev.filter((id) => visibleOrderIds.has(id)));
    }, [orders]);

    useEffect(() => {
        if (activeTab !== "order_products") {
            return;
        }

        let cancelled = false;
        void fetchOrderStatuses()
            .then((res) => {
                if (cancelled) {
                    return;
                }
                setOrderProductStatusCodes(
                    new Set(
                        res.data
                            .filter((row) => Boolean(row.show_in_order_products))
                            .map((row) => row.code),
                    ),
                );
            })
            .catch((error) => {
                console.error(error);
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab]);

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

    useEffect(() => {
        if (activeTab !== "supplier_order") {
            return;
        }

        const loadDraft = async () => {
            try {
                setLoading(true);
                setToast(null);
                const response = await fetchSupplierOrderDraft();
                setSupplierDraftItems(response.data ?? []);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить заявку у поставщиков" });
            } finally {
                setLoading(false);
            }
        };

        void loadDraft();
    }, [activeTab, supplierDraftReloadNonce]);

    useEffect(() => {
        if (activeTab !== "supplier_orders") {
            return;
        }

        const loadConfirmed = async () => {
            try {
                setLoading(true);
                setToast(null);
                const response = await fetchSupplierOrders({
                    page: supplierOrdersPage,
                    per_page: 25,
                });
                setSupplierOrdersList(response.data ?? []);
                setSupplierOrdersMeta({
                    current_page: response.current_page,
                    last_page: response.last_page,
                    total: response.total,
                });
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить заказы поставщикам" });
            } finally {
                setLoading(false);
            }
        };

        void loadConfirmed();
    }, [activeTab, supplierOrdersPage, supplierOrdersReloadNonce]);

    const handleFormSupplierDraft = async () => {
        setSupplierDraftForming(true);
        setToast(null);
        try {
            const response = await createSupplierOrderDraftFromReservations();
            const data: DraftFromReservationsResult = response.data;
            const added = data.added ?? 0;
            const ignored = data.ignored_order_ids.length;
            setToast({
                type: added > 0 ? "success" : ignored > 0 ? "error" : "error",
                message:
                    response.message
                    || (added > 0
                        ? "Заявка сформирована"
                        : ignored > 0
                          ? `Нет позиций для заявки. Пропущено заказов: ${ignored}`
                          : "Нет позиций для заявки"),
            });
            const report = await fetchSupplierOrderReservationsReport({
                page: 1,
                order_id: typeof orderFilter === "number" ? orderFilter : undefined,
            });
            setOrderProducts(report.data ?? []);
            if (Array.isArray(report.filter_orders)) {
                setOrderProductsFilterOrders(report.filter_orders);
            }
            if (added > 0) {
                setActiveTab("supplier_order");
                setSupplierDraftReloadNonce((n) => n + 1);
            }
            setSupplierDraftConfirmOpen(false);
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Не удалось сформировать заявку",
            });
        } finally {
            setSupplierDraftForming(false);
        }
    };

    const handleConfirmSupplierOrders = async () => {
        if (supplierDraftItems.length === 0) {
            return;
        }
        setSupplierDraftConfirming(true);
        setToast(null);
        try {
            const response = await confirmSupplierOrders();
            const count = response.data.length;
            setToast({
                type: count > 0 ? "success" : "error",
                message: response.message || (count > 0 ? "Заказы сформированы" : "Нет черновиков"),
            });
            if (count > 0) {
                setSupplierDraftItems([]);
                setActiveTab("supplier_orders");
                setSupplierOrdersPage(1);
                setSupplierOrdersReloadNonce((n) => n + 1);
            }
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Не удалось сформировать заказ",
            });
        } finally {
            setSupplierDraftConfirming(false);
        }
    };

    const handleSupplierDraftQtyChange = async (itemId: number, qty: number) => {
        if (!Number.isFinite(qty) || qty < 1) {
            return;
        }
        setSupplierDraftQtySavingId(itemId);
        try {
            const response = await updateSupplierOrderDraftItemQty(itemId, Math.floor(qty));
            setSupplierDraftItems((prev) =>
                prev.map((row) => (row.id === itemId ? response.data : row)),
            );
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось изменить количество" });
            setSupplierDraftReloadNonce((n) => n + 1);
        } finally {
            setSupplierDraftQtySavingId(null);
        }
    };

    const toggleExpandedSupplierOrder = async (orderId: number) => {
        if (expandedSupplierOrderId === orderId) {
            setExpandedSupplierOrderId(null);
            setExpandedSupplierOrder(null);
            return;
        }
        setExpandedSupplierOrderId(orderId);
        setExpandedSupplierOrderLoading(true);
        setExpandedSupplierOrder(null);
        try {
            const response = await fetchSupplierOrder(orderId);
            setExpandedSupplierOrder(response.data);
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось загрузить состав заказа" });
            setExpandedSupplierOrderId(null);
        } finally {
            setExpandedSupplierOrderLoading(false);
        }
    };

    const handleExportSupplierOrderXlsx = async (orderId: number) => {
        setSupplierOrderExportingId(orderId);
        setToast(null);
        try {
            await exportSupplierOrderXlsx(orderId);
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Не удалось скачать XLSX",
            });
        } finally {
            setSupplierOrderExportingId(null);
        }
    };

    const handleAddSupplierDraftProduct = async (row: { id: number }) => {
        setSupplierDraftAdding(true);
        setToast(null);
        try {
            const response = await addSupplierOrderDraftItem({
                supplier_product_id: row.id,
                qty: 1,
            });
            setSupplierDraftItems((prev) => [...prev, response.data]);
            setSupplierDraftAddOpen(false);
            setToast({ type: "success", message: response.message || "Товар добавлен" });
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Не удалось добавить товар",
            });
        } finally {
            setSupplierDraftAdding(false);
        }
    };

    const handleDeleteSupplierDraftItem = async (itemId: number) => {
        setSupplierDraftDeletingId(itemId);
        setToast(null);
        try {
            await deleteSupplierOrderDraftItem(itemId);
            setSupplierDraftItems((prev) => prev.filter((row) => row.id !== itemId));
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Не удалось удалить позицию",
            });
        } finally {
            setSupplierDraftDeletingId(null);
        }
    };
    const statusOptionsForOrderProduct = useCallback(
        (status: string, statusLabel?: string | null, statusColor?: string | null) => {
            if (orderStatusOptions.some((item) => item.value === status)) {
                return orderStatusOptions;
            }
            return [
                ...orderStatusOptions,
                {
                    value: status,
                    label: getOrderStatusLabel(status, statusLabel),
                    color: getOrderStatusColor(status, statusColor),
                },
            ];
        },
        [orderStatusOptions],
    );

    const applyOrderProductStatusChange = useCallback(
        async (orderId: number, nextStatus: string) => {
            setOrderProductsStatusSaving(true);
            setToast(null);
            try {
                const response = await updateOrderStatus(orderId, nextStatus);
                const updated = response.data;
                const resolvedStatus = (updated.status ?? nextStatus).trim();
                const keepInList =
                    orderProductStatusCodes.size === 0 ||
                    orderProductStatusCodes.has(resolvedStatus);

                setOrderProducts((prev) => {
                    if (!keepInList) {
                        return prev.filter((row) => row.order_id !== orderId);
                    }
                    return prev.map((row) =>
                        row.order_id === orderId
                            ? {
                                ...row,
                                order_status: resolvedStatus,
                                order_status_label:
                                    updated.status_label ??
                                    getOrderStatusLabel(resolvedStatus, row.order_status_label),
                                order_status_color:
                                    updated.status_color ??
                                    getOrderStatusColor(resolvedStatus, row.order_status_color),
                            }
                            : row,
                    );
                });

                if (!keepInList) {
                    setOrderProductsFilterOrders((prev) => prev.filter((id) => id !== orderId));
                    if (orderFilter === orderId) {
                        setOrderFilter("");
                    }
                }

                setToast({ type: "success", message: "Статус заказа обновлён" });
                setOrderProductsStatusConfirm(null);
            } catch (error) {
                console.error(error);
                setToast({
                    type: "error",
                    message: error instanceof Error ? error.message : "Не удалось обновить статус",
                });
                setOrderProductsStatusConfirm(null);
            } finally {
                setOrderProductsStatusSaving(false);
            }
        },
        [orderFilter, orderProductStatusCodes],
    );

    const requestOrderProductStatusChange = useCallback(
        (orderId: number, currentStatus: string, nextStatus: string) => {
            if (!nextStatus || nextStatus === currentStatus || orderProductsStatusSaving) {
                return;
            }
            if (COMPLETED_ORDER_STATUSES.has(currentStatus)) {
                return;
            }
            if (nextStatus === "done" || nextStatus === "completed") {
                setOrderProductsStatusConfirm({ orderId, nextStatus, kind: "done" });
                return;
            }
            if (nextStatus === "cancelled") {
                setOrderProductsStatusConfirm({ orderId, nextStatus, kind: "cancelled" });
                return;
            }
            void applyOrderProductStatusChange(orderId, nextStatus);
        },
        [applyOrderProductStatusChange, orderProductsStatusSaving],
    );

    const selectOrderProductSupplier = useCallback(
        async (
            row: SupplierOrderReservationRow,
            supplier: SupplierOrderReservationRow["suppliers"][number],
        ) => {
            if (supplier.is_selected || orderProductsFulfillmentSavingKey) {
                return;
            }
            const itemId =
                typeof row.order_item_id === "number" && row.order_item_id > 0
                    ? row.order_item_id
                    : Number(String(row.id).replace(/^oi-/, ""));
            if (!Number.isFinite(itemId) || itemId <= 0) {
                setToast({ type: "error", message: "Не удалось определить позицию заказа" });
                return;
            }

            const kind =
                supplier.kind ??
                (typeof supplier.offer_id === "number" && supplier.offer_id > 0
                    ? "offer"
                    : typeof supplier.lot_id === "number" && supplier.lot_id > 0
                        ? "warehouse"
                        : supplier.name === "Склад"
                            ? "warehouse"
                            : null);
            if (kind !== "warehouse" && kind !== "offer") {
                return;
            }

            const savingKey = `${row.id}:${supplier.offer_id ?? supplier.lot_id ?? supplier.name ?? ""}`;
            setOrderProductsFulfillmentSavingKey(savingKey);
            setToast(null);
            try {
                const response = await updateOrderItemFulfillment(row.order_id, itemId, {
                    channel: kind === "warehouse" ? "main" : "offer",
                    lot_id: kind === "warehouse" ? (supplier.lot_id ?? null) : null,
                    supplier_variant_offer_id: kind === "offer" ? (supplier.offer_id ?? null) : null,
                });
                const nextOfferId = response.data.supplier_variant_offer_id;
                const nextLotIds = new Set(
                    (response.data.stock_lot_allocations ?? []).map((a) => a.lot_id),
                );

                setOrderProducts((prev) =>
                    prev.map((item) => {
                        if (item.id !== row.id) {
                            return item;
                        }
                        return {
                            ...item,
                            availability_source: response.data.availability_source,
                            supplier_variant_offer_id: nextOfferId,
                            suppliers: item.suppliers.map((s) => {
                                const sKind =
                                    s.kind ??
                                    (typeof s.offer_id === "number" && s.offer_id > 0
                                        ? "offer"
                                        : typeof s.lot_id === "number" && s.lot_id > 0
                                            ? "warehouse"
                                            : s.name === "Склад"
                                                ? "warehouse"
                                                : null);
                                let isSelected = false;
                                if (sKind === "warehouse") {
                                    isSelected =
                                        nextOfferId == null &&
                                        (typeof s.lot_id === "number" && s.lot_id > 0
                                            ? nextLotIds.has(s.lot_id)
                                            : nextLotIds.size === 0);
                                } else if (sKind === "offer") {
                                    isSelected =
                                        nextOfferId != null &&
                                        typeof s.offer_id === "number" &&
                                        s.offer_id === nextOfferId;
                                }
                                return { ...s, is_selected: isSelected };
                            }),
                        };
                    }),
                );
                setToast({ type: "success", message: "Поставщик выбран" });
            } catch (error) {
                console.error(error);
                setToast({
                    type: "error",
                    message: error instanceof Error ? error.message : "Не удалось выбрать поставщика",
                });
            } finally {
                setOrderProductsFulfillmentSavingKey(null);
            }
        },
        [orderProductsFulfillmentSavingKey],
    );

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
            const countryAttribute = response.data.find((attribute) => attribute.id === 13);
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
            `Отправить в курьерскую службу ветерОК ${candidateIds.length} заказ(ов)?\n#${candidateIds.join(", #")}`,
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
                        { shipment_id: row.shipment_id, status: row.status || "assembled" },
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
                        `Отправлено в ветерОК: ${sent.length}` +
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
                message: error instanceof Error ? error.message : "Ошибка отправки в ветерОК",
            });
        } finally {
            setVeterSending(false);
        }
    };

    const handleVeterStatusSync = async () => {
        const ok = window.confirm(
            "Обновить статусы курьерской службы для заказов «Собран» / «В доставке» с ID отправки?",
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
                        `Статусы ветерОК обновлены: ${updated.length}`,
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
                const byId = new Map(updated.map((row) => [row.order_id, row]));
                setOrders((prev) =>
                    prev.map((order) => {
                        const row = byId.get(order.id);
                        if (!row) {
                            return order;
                        }
                        return {
                            ...order,
                            status: row.status ?? order.status,
                            shipment_status: row.shipment_status ?? order.shipment_status,
                            shipment_status_at: new Date().toISOString(),
                            shipment_date:
                                row.shipment_date !== undefined && row.shipment_date !== null
                                    ? row.shipment_date
                                    : order.shipment_date,
                        };
                    }),
                );
            }
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message:
                    error instanceof Error ? error.message : "Ошибка обновления статусов ветерОК",
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
            <AdminRichTabs
                items={ORDER_TABS}
                activeTab={activeTab}
                onChangeAction={setActiveTab}
            />

            {activeTab === "orders" ? (
                <AdminTableToolbar>
                    <div className="flex w-full min-w-0 flex-col gap-4">
                        <div className="flex flex-nowrap items-center gap-1.5 md:flex-wrap md:items-end md:justify-between md:gap-3">
                            <div className="flex shrink-0 items-center gap-1 md:gap-2">
                                {ordersMeta !== null && (
                                    <div className="mr-1 whitespace-nowrap text-sm text-admin-text-secondary md:mr-2">
                                        Всего заказов: {ordersMeta.total}
                                    </div>
                                )}
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
                                            : `Отправить в курьерскую службу${veterSendCandidateCount > 0
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
                                        syncWithUrl={false}
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
                </AdminTableToolbar>
            ) : activeTab === "order_products" ? (
                <div className="mb-3 flex items-center justify-between gap-1.5 rounded-lg border border-admin-border bg-admin-muted px-2 py-1">
                    <button
                        type="button"
                        onClick={() => setSupplierDraftConfirmOpen(true)}
                        disabled={supplierDraftForming || loading}
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-admin-border bg-white px-2.5 text-sm font-medium text-admin-text transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {supplierDraftForming ? "Формирование…" : "Сформировать заявку"}
                    </button>
                    <div className="flex items-center gap-1.5">
                        <select
                            value={orderFilter}
                            onChange={(e) => setOrderFilter(e.target.value ? Number(e.target.value) : "")}
                            className="h-8 rounded-md border border-admin-border bg-white px-2 text-sm"
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
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-admin-border bg-white text-admin-text-secondary transition hover:bg-white/80 hover:text-admin-text"
                                title="Сбросить фильтры"
                                aria-label="Сбросить фильтры"
                            >
                                <FilterX size={14} strokeWidth={2} />
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : activeTab === "supplier_order" ? (
                <div className="mb-3 flex items-center justify-between gap-1.5 rounded-lg border border-admin-border bg-admin-muted px-2 py-1">
                    <button
                        type="button"
                        onClick={() => setSupplierDraftAddOpen(true)}
                        disabled={loading || supplierDraftAdding}
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-admin-border bg-white px-2.5 text-sm font-medium text-admin-text transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Добавить товар
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleConfirmSupplierOrders()}
                        disabled={
                            supplierDraftConfirming ||
                            loading ||
                            supplierDraftItems.length === 0
                        }
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-admin-primary bg-admin-primary px-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {supplierDraftConfirming ? "Формирование…" : "Сформировать заказ"}
                    </button>
                </div>
            ) : null}

            {activeTab === "orders" && (hasDateFilter || hasStatusFilter) ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {hasStatusFilter ? (
                        <span
                            className={filterChipClassName}
                            style={solidColorPillStyle("#3B82F6")}
                        >
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 opacity-80">Статус</span>
                                <span className="max-w-[16rem] truncate">{statusFilterLabel}</span>
                            </span>
                            <button
                                type="button"
                                onClick={clearStatusFilter}
                                className="ml-0.5 inline-flex shrink-0 rounded-full p-0.5 opacity-80 transition hover:bg-black/10 hover:opacity-100"
                                aria-label="Сбросить фильтр по статусу"
                                title="Сбросить"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        </span>
                    ) : null}
                    {hasDateFilter ? (
                        <span
                            className={filterChipClassName}
                            style={solidColorPillStyle("#0EA5E9")}
                        >
                            <button
                                type="button"
                                onClick={() => dateFilterRef.current?.open()}
                                className="inline-flex min-w-0 items-center gap-1.5 text-left opacity-95 transition hover:opacity-100"
                                title="Изменить фильтр по дате отправки"
                            >
                                <span className="shrink-0 opacity-80">Дата</span>
                                <span className="max-w-[16rem] truncate normal-case tracking-normal">
                                    {dateFilterSummary}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={clearDateFilter}
                                className="ml-0.5 inline-flex shrink-0 rounded-full p-0.5 opacity-80 transition hover:bg-black/10 hover:opacity-100"
                                aria-label="Сбросить фильтр по дате отправки"
                                title="Сбросить"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        </span>
                    ) : null}
                </div>
            ) : null}

            {loading && (activeTab !== "orders" || ordersMeta === null) && (
                <AdminLoadingState
                    text={
                        activeTab === "orders"
                            ? "Загрузка заказов…"
                            : activeTab === "supplier_order"
                                ? "Загрузка заявки…"
                                : activeTab === "supplier_orders"
                                    ? "Загрузка заказов поставщикам…"
                                    : "Загрузка…"
                    }
                />
            )}

            {activeTab === "orders" && ordersMeta !== null && (
                <>
                    <AdminOrdersTable
                        initialOrders={orders}
                        searchQuery={searchInput}
                        onSuccessMessageAction={(message) => setToast({ type: "success", message })}
                        onErrorMessageAction={(message) => setToast({ type: "error", message })}
                        onDateFilterHeaderClickAction={() => dateFilterRef.current?.open()}
                        onOrdersReloadAction={() => setOrdersReloadNonce((n) => n + 1)}
                        statusFilter={statusFilter}
                        onStatusFilterChangeAction={setStatusFilter}
                        selectedOrderIds={selectedOrderIds}
                        onSelectedOrderIdsChangeAction={setSelectedOrderIds}
                        hideTerminalStatuses={!hasOrdersFilters}
                    />
                    {ordersMeta.total === 0 ? (
                        <AdminEmptyState
                            title="Заказы не найдены"
                            description="Попробуйте изменить поиск, статус или фильтр по дате отправки."
                        />
                    ) : (
                        <div className="mt-4 flex flex-col gap-3 border-t border-admin-border pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-admin-text-secondary">
                                На странице
                                <select
                                    value={ordersPerPage}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        if (v === 25 || v === 50 || v === 100) {
                                            setOrdersPerPage(v as (typeof ORDERS_PER_PAGE_OPTIONS)[number]);
                                        }
                                    }}
                                    className="cursor-pointer rounded-lg border border-admin-border bg-white px-2 py-1.5 text-sm"
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
                        </div>
                    )}
                </>
            )}

            {!loading && activeTab === "order_products" && orderProducts.length === 0 && (
                <AdminEmptyState
                    title="Товаров для заказа нет"
                    description="Нет товаров в заказах со статусами для вкладки «Товары для заказов»."
                />
            )}

            {!loading && activeTab === "order_products" && orderProducts.length > 0 && (
                <>
                    <div className="overflow-x-auto rounded-2xl border">
                        <table className="min-w-full table-fixed text-sm">
                            <colgroup>
                                <col />
                                <col style={{ width: "1%" }} />
                                <col
                                    style={
                                        supplierProductsColWidth === null
                                            ? { width: "14rem" }
                                            : {
                                                width: `${supplierProductsColWidth}px`,
                                                minWidth: `${supplierProductsColWidth}px`,
                                            }
                                    }
                                />
                                <col style={{ width: "5.5rem" }} />
                                <col style={{ width: "4.25rem" }} />
                                <col style={{ width: "2.75rem" }} />
                            </colgroup>
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-3 py-2">Товар</th>
                                    <th className="whitespace-nowrap px-3 py-2">Поставщик</th>
                                    <th
                                        ref={supplierProductsThRef}
                                        className="relative px-3 py-2 pr-4"
                                    >
                                        Товары
                                        <span
                                            role="separator"
                                            aria-orientation="vertical"
                                            aria-label="Изменить ширину колонки товары"
                                            title="Потяните, чтобы изменить ширину. Двойной клик — авто"
                                            onMouseDown={onSupplierProductsColResizeStart}
                                            onDoubleClick={() => setSupplierProductsColWidth(null)}
                                            className={`absolute inset-y-1 right-0 flex w-3 cursor-col-resize touch-none items-center justify-center rounded-sm border-r-2 transition ${supplierProductsColWidth !== null
                                                    ? "border-admin-primary/50 bg-admin-primary/10 text-admin-primary"
                                                    : "border-transparent text-admin-text-muted/50 hover:border-admin-primary/40 hover:bg-admin-primary/10 hover:text-admin-primary"
                                                }`}
                                        >
                                            <GripVertical size={12} strokeWidth={2.25} aria-hidden className="opacity-80" />
                                        </span>
                                    </th>
                                    <th className="whitespace-nowrap px-2 py-2">Код</th>
                                    <th className="whitespace-nowrap px-2 py-2 text-right">Цена</th>
                                    <th className="whitespace-nowrap px-2 py-2 text-right">К-во</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderProductsGrouped.map((group) => {
                                    const orderStatusRow = group.products[0];
                                    const orderStatus = orderStatusRow?.order_status ?? null;
                                    const productRows = group.products.flatMap((row) => {
                                        const suppliers =
                                            row.suppliers.length > 0
                                                ? row.suppliers
                                                : [{ name: null, product_name: null, code: null, price: null, is_selected: false }];
                                        return suppliers.map((s, supplierIndex) => ({
                                            row,
                                            supplier: s,
                                            supplierIndex,
                                            supplierCount: suppliers.length,
                                        }));
                                    });

                                    return (
                                        <Fragment key={group.orderId}>
                                            <tr className="border-b bg-admin-muted/70">
                                                <td
                                                    colSpan={6}
                                                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-admin-text"
                                                >
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                        <span>
                                                            Заказ #{group.orderId}
                                                            <span className="ml-2 font-normal normal-case tracking-normal text-admin-text-secondary">
                                                                {group.products.length}{" "}
                                                                {group.products.length === 1 ? "товар" : "тов."}
                                                            </span>
                                                        </span>
                                                        {orderStatus ? (
                                                            <AdminStatusDropdown
                                                                value={orderStatus}
                                                                options={statusOptionsForOrderProduct(
                                                                    orderStatus,
                                                                    orderStatusRow?.order_status_label,
                                                                    orderStatusRow?.order_status_color,
                                                                )}
                                                                onChangeAction={(nextStatus) =>
                                                                    requestOrderProductStatusChange(
                                                                        group.orderId,
                                                                        orderStatus,
                                                                        nextStatus,
                                                                    )
                                                                }
                                                                disabled={
                                                                    orderProductsStatusSaving ||
                                                                    COMPLETED_ORDER_STATUSES.has(orderStatus)
                                                                }
                                                                triggerVariant="text"
                                                                triggerColor={getOrderStatusColor(
                                                                    orderStatus,
                                                                    orderStatusRow?.order_status_color,
                                                                )}
                                                                triggerTextClassName={ORDER_PRODUCTS_STATUS_TRIGGER_CLASS}
                                                                widthClassName="w-auto"
                                                                menuWidthClassName={ORDER_PRODUCTS_STATUS_MENU_WIDTH}
                                                            />
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                            {productRows.map(({ row, supplier, supplierIndex, supplierCount }) => {
                                                const selected = Boolean(supplier.is_selected);
                                                const selectedText = selected ? "font-semibold text-emerald-600" : "";
                                                const supplierProductName = supplier.product_name ?? "—";
                                                return (
                                                    <tr
                                                        key={`${row.id}-${supplierIndex}`}
                                                        className="border-b last:border-b-0"
                                                    >
                                                        {supplierIndex === 0 ? (
                                                            <td
                                                                rowSpan={supplierCount}
                                                                className="border-r border-admin-border/60 px-3 py-2 align-top"
                                                            >
                                                                <div className="font-medium">{row.product_name ?? "—"}</div>
                                                                <div className="text-xs text-admin-text-secondary">
                                                                    {row.variant_title ?? "—"}
                                                                </div>
                                                            </td>
                                                        ) : null}
                                                        <td className={`px-3 py-1.5 align-top whitespace-nowrap ${selectedText}`}>
                                                            {supplier.name ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        selected ||
                                                                        Boolean(orderProductsFulfillmentSavingKey) ||
                                                                        (!supplier.offer_id &&
                                                                            !supplier.lot_id &&
                                                                            supplier.name !== "Склад" &&
                                                                            supplier.kind !== "warehouse" &&
                                                                            supplier.kind !== "offer")
                                                                    }
                                                                    onClick={() =>
                                                                        void selectOrderProductSupplier(row, supplier)
                                                                    }
                                                                    className={`inline-flex items-center gap-1 rounded-sm transition duration-150 enabled:hover:scale-105 enabled:hover:underline disabled:cursor-default ${selected
                                                                            ? "font-semibold text-emerald-600"
                                                                            : "text-inherit enabled:cursor-pointer"
                                                                        }`}
                                                                    title={
                                                                        selected
                                                                            ? "Уже выбран в заказе"
                                                                            : "Выбрать этого поставщика в заказе"
                                                                    }
                                                                >
                                                                    {selected ? (
                                                                        <Check
                                                                            size={14}
                                                                            strokeWidth={2.5}
                                                                            className="shrink-0 text-emerald-600"
                                                                            aria-hidden
                                                                        />
                                                                    ) : null}
                                                                    {supplier.name}
                                                                </button>
                                                            ) : (
                                                                "—"
                                                            )}
                                                        </td>
                                                        <td className={`px-3 py-1.5 align-top ${selectedText}`}>
                                                            <button
                                                                type="button"
                                                                className="block w-full min-w-0 cursor-default truncate text-left"
                                                                onMouseEnter={(event) =>
                                                                    showSupplierProductTooltip(
                                                                        supplierProductName,
                                                                        event.currentTarget,
                                                                    )
                                                                }
                                                                onMouseLeave={hideSupplierProductTooltipWithDelay}
                                                                onFocus={(event) =>
                                                                    showSupplierProductTooltip(
                                                                        supplierProductName,
                                                                        event.currentTarget,
                                                                    )
                                                                }
                                                                onBlur={hideSupplierProductTooltipWithDelay}
                                                                aria-label={
                                                                    supplierProductName !== "—"
                                                                        ? `Товар у поставщика: ${supplierProductName}`
                                                                        : "Товар у поставщика не указан"
                                                                }
                                                            >
                                                                {supplierProductName}
                                                            </button>
                                                        </td>
                                                        <td
                                                            className={`px-2 py-1.5 align-top whitespace-nowrap tabular-nums ${selectedText}`}
                                                        >
                                                            {supplier.code ?? "—"}
                                                        </td>
                                                        <td
                                                            className={`px-2 py-1.5 align-top whitespace-nowrap text-right tabular-nums ${selectedText}`}
                                                        >
                                                            {supplier.price ?? "—"}
                                                        </td>
                                                        {supplierIndex === 0 ? (
                                                            <td
                                                                rowSpan={supplierCount}
                                                                className="px-2 py-2 align-top text-right tabular-nums"
                                                            >
                                                                {row.qty}
                                                            </td>
                                                        ) : null}
                                                    </tr>
                                                );
                                            })}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <SupplierProductNameTooltip
                        tooltip={supplierProductTooltip}
                        onMouseEnterAction={clearSupplierProductTooltipHideTimer}
                        onMouseLeaveAction={hideSupplierProductTooltipWithDelay}
                    />
                </>
            )}

            {!loading && activeTab === "supplier_order" && supplierDraftItems.length === 0 && (
                <AdminEmptyState
                    title="Заявка пуста"
                    description="Сформируйте заявку на вкладке «Товары для заказов» или добавьте товар вручную."
                />
            )}

            {!loading && activeTab === "supplier_order" && supplierDraftItems.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-admin-text-secondary">
                                <th className="whitespace-nowrap px-3 py-2">Заказ</th>
                                <th className="whitespace-nowrap px-3 py-2">Поставщик</th>
                                <th className="whitespace-nowrap px-3 py-2">Код</th>
                                <th className="px-3 py-2">Название товара</th>
                                <th className="whitespace-nowrap px-3 py-2 text-right">Цена у поставщика</th>
                                <th className="whitespace-nowrap px-3 py-2 text-right">Актуальная цена</th>
                                <th className="whitespace-nowrap px-3 py-2 text-right">Кол-во</th>
                                <th className="whitespace-nowrap px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {supplierDraftItems.map((item) => {
                                const tone = comparePurchasePriceTone(
                                    item.purchase_price_at_order,
                                    item.current_purchase_price,
                                );
                                return (
                                    <tr
                                        key={item.id}
                                        className={`border-b last:border-0 ${item.offer_missing ? "bg-red-50" : ""
                                            }`}
                                    >
                                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                            {item.order_id != null ? `#${item.order_id}` : "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {item.supplier_name ?? "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                                            {item.supplier_code ?? "—"}
                                        </td>
                                        <td className="max-w-[18rem] truncate px-3 py-2" title={item.supplier_product_name ?? undefined}>
                                            {item.supplier_product_name ?? "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                            {item.purchase_price_at_order ?? "—"}
                                        </td>
                                        <td
                                            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${tone === "higher"
                                                    ? "font-medium text-red-600"
                                                    : tone === "lower"
                                                        ? "font-medium text-emerald-600"
                                                        : ""
                                                }`}
                                        >
                                            {item.current_purchase_price ?? "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            <input
                                                type="number"
                                                min={1}
                                                max={9999}
                                                value={item.qty}
                                                disabled={supplierDraftQtySavingId === item.id}
                                                onChange={(e) => {
                                                    const next = Number(e.target.value);
                                                    setSupplierDraftItems((prev) =>
                                                        prev.map((row) =>
                                                            row.id === item.id
                                                                ? { ...row, qty: Number.isFinite(next) ? next : row.qty }
                                                                : row,
                                                        ),
                                                    );
                                                }}
                                                onBlur={(e) => {
                                                    const next = Math.floor(Number(e.target.value));
                                                    if (!Number.isFinite(next) || next < 1) {
                                                        setSupplierDraftReloadNonce((n) => n + 1);
                                                        return;
                                                    }
                                                    void handleSupplierDraftQtyChange(item.id, next);
                                                }}
                                                className="h-7 w-16 rounded border border-admin-border bg-white px-1.5 text-right text-sm tabular-nums"
                                            />
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            <button
                                                type="button"
                                                disabled={supplierDraftDeletingId === item.id}
                                                onClick={() => void handleDeleteSupplierDraftItem(item.id)}
                                                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                                                title="Удалить из заявки"
                                            >
                                                {supplierDraftDeletingId === item.id ? "…" : "Удалить"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && activeTab === "supplier_orders" && supplierOrdersList.length === 0 && (
                <AdminEmptyState
                    title="Заказов поставщикам нет"
                    description="После «Сформировать заказ» на вкладке «Заказ у поставщиков» здесь появятся номера и состав."
                />
            )}

            {!loading && activeTab === "supplier_orders" && supplierOrdersList.length > 0 && (
                <>
                    <div className="overflow-x-auto rounded-2xl border">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="whitespace-nowrap px-3 py-2">Номер</th>
                                    <th className="whitespace-nowrap px-3 py-2">Поставщик</th>
                                    <th className="whitespace-nowrap px-3 py-2">Дата</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-right">Позиций</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-right">Сумма</th>
                                    <th className="whitespace-nowrap px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {supplierOrdersList.map((order) => {
                                    const expanded = expandedSupplierOrderId === order.id;
                                    return (
                                        <Fragment key={order.id}>
                                            <tr className="border-b last:border-0">
                                                <td className="whitespace-nowrap px-3 py-2 font-medium">
                                                    {order.number
                                                        ?? `${(order.supplier_name ?? "SP").replace(/\s+/g, "")}-${order.id}`}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2">
                                                    {order.supplier_name ?? "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-admin-text-secondary">
                                                    {formatSupplierOrderDate(order.ordered_at)}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                                    {order.items_qty}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                                    {order.total}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleExportSupplierOrderXlsx(order.id)}
                                                            disabled={supplierOrderExportingId === order.id}
                                                            className="text-xs font-medium text-admin-primary hover:underline disabled:opacity-60"
                                                        >
                                                            {supplierOrderExportingId === order.id
                                                                ? "XLSX…"
                                                                : "XLSX"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void toggleExpandedSupplierOrder(order.id)}
                                                            className="text-xs font-medium text-admin-primary hover:underline"
                                                        >
                                                            {expanded ? "Скрыть" : "Состав"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded ? (
                                                <tr className="border-b bg-admin-muted/40">
                                                    <td colSpan={6} className="px-3 py-2">
                                                        {expandedSupplierOrderLoading ? (
                                                            <div className="py-2 text-sm text-admin-text-secondary">
                                                                Загрузка состава…
                                                            </div>
                                                        ) : expandedSupplierOrder?.items &&
                                                            expandedSupplierOrder.items.length > 0 ? (
                                                            <table className="min-w-full text-xs">
                                                                <thead>
                                                                    <tr className="text-left text-admin-text-secondary">
                                                                        <th className="py-1 pr-3">Код</th>
                                                                        <th className="py-1 pr-3">Название</th>
                                                                        <th className="py-1 pr-3 text-right">Цена закупки</th>
                                                                        <th className="py-1 text-right">Кол-во</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {expandedSupplierOrder.items.map((line) => (
                                                                        <tr key={line.id} className="border-t border-admin-border/60">
                                                                            <td className="py-1 pr-3 font-mono">
                                                                                {line.supplier_code ?? "—"}
                                                                            </td>
                                                                            <td className="py-1 pr-3">
                                                                                {line.supplier_product_name ?? "—"}
                                                                            </td>
                                                                            <td className="py-1 pr-3 text-right tabular-nums">
                                                                                {line.purchase_price_at_order ?? "—"}
                                                                            </td>
                                                                            <td className="py-1 text-right tabular-nums">
                                                                                {line.qty}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div className="py-2 text-sm text-admin-text-secondary">
                                                                Состав пуст
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {supplierOrdersMeta && supplierOrdersMeta.last_page > 1 ? (
                        <div className="mt-3 flex justify-center">
                            <AdminPagination
                                currentPage={supplierOrdersMeta.current_page}
                                lastPage={supplierOrdersMeta.last_page}
                                onPrevAction={() =>
                                    setSupplierOrdersPage((p) => Math.max(1, p - 1))
                                }
                                onNextAction={() =>
                                    setSupplierOrdersPage((p) =>
                                        supplierOrdersMeta.current_page < supplierOrdersMeta.last_page
                                            ? p + 1
                                            : p,
                                    )
                                }
                            />
                        </div>
                    ) : null}
                </>
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

            <AdminConfirmDialog
                open={orderProductsStatusConfirm !== null}
                title={
                    orderProductsStatusConfirm?.kind === "done"
                        ? "Перевести заказ в «Выполнен»?"
                        : "Перевести заказ в «Отменён»?"
                }
                message={
                    orderProductsStatusConfirm?.kind === "done"
                        ? "Для статуса «Выполнен» будет создано складское списание по резервам и связанные операции. Позже состав заказа изменить будет нельзя."
                        : "Для статуса «Отменён» будут сняты резервы на складе и выполнен возврат по подарочным сертификатам заказа (если применимо)."
                }
                confirmText="Подтвердить"
                cancelText="Отмена"
                loading={orderProductsStatusSaving}
                onConfirmAction={() => {
                    if (!orderProductsStatusConfirm) {
                        return;
                    }
                    void applyOrderProductStatusChange(
                        orderProductsStatusConfirm.orderId,
                        orderProductsStatusConfirm.nextStatus,
                    );
                }}
                onCloseAction={() => {
                    if (!orderProductsStatusSaving) {
                        setOrderProductsStatusConfirm(null);
                    }
                }}
            />

            <AdminConfirmDialog
                open={supplierDraftConfirmOpen}
                title="Сформировать заявку?"
                message="В заявку попадут только заказы, где все позиции закрыты: либо склад, либо выбранный офер поставщика. Если в заказе есть «дырка» (позиция без склада и без офера) — такие заказы не дробятся, в заявку не попадают и получают статус «Ожидает появления». У полностью закрытых заказов статус сменится на «Заказан»."
                confirmText="Сформировать"
                cancelText="Отмена"
                confirmLoadingText="Формирование…"
                loading={supplierDraftForming}
                onConfirmAction={() => {
                    void handleFormSupplierDraft();
                }}
                onCloseAction={() => {
                    if (!supplierDraftForming) {
                        setSupplierDraftConfirmOpen(false);
                    }
                }}
            />

            <SupplierDraftAddProductModal
                open={supplierDraftAddOpen}
                adding={supplierDraftAdding}
                onCloseAction={() => {
                    if (!supplierDraftAdding) {
                        setSupplierDraftAddOpen(false);
                    }
                }}
                onSelectAction={(row) => {
                    void handleAddSupplierDraftProduct(row);
                }}
            />
        </AdminPageCard>
    );
}