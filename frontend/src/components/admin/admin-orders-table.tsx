"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { OrderData } from "@/types/orders";
import { fetchOrder, updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusTableTextClass, ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";

type Props = {
    initialOrders: OrderData[];
    searchQuery?: string;
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
    /** Подпись фильтра по дате создания (как у кнопки в тулбаре). */
    dateFilterSummary?: string;
    /** Открыть тот же попап фильтра по датам (вызывается с родителя). */
    onDateFilterHeaderClickAction?: () => void;
    selectedOrderIds?: number[];
    onSelectedOrderIdsChangeAction?: (ids: number[]) => void;
};

const STATUS_DROPDOWN_MENU_WIDTH_CLASS = "w-[220px]";

const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

type AddressTooltipState = {
    lines: string[];
    x: number;
    y: number;
} | null;

function highlightQueryInText(text: string, query: string): ReactNode {
    const q = query.trim();
    if (!q) {
        return text;
    }

    const lowerText = text.toLocaleLowerCase("ru-RU");
    const lowerQ = q.toLocaleLowerCase("ru-RU");
    const parts: ReactNode[] = [];
    let pos = 0;

    for (let i = 0; i < 80 && pos < text.length; i += 1) {
        const idx = lowerText.indexOf(lowerQ, pos);
        if (idx === -1) {
            parts.push(text.slice(pos));
            break;
        }

        if (idx > pos) {
            parts.push(text.slice(pos, idx));
        }

        parts.push(
            <mark
                key={`ord-hl-${idx}-${i}`}
                className="rounded-sm bg-amber-200 px-0.5 text-admin-text"
            >
                {text.slice(idx, idx + q.length)}
            </mark>,
        );

        pos = idx + q.length;
    }

    return parts.length > 0 ? <>{parts}</> : text;
}

function formatOrderCreatedParts(value?: string | null): { date: string; time: string } | null {
    if (!value) {
        return null;
    }
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        return {
            date: d.toLocaleDateString("ru-RU"),
            time: d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        };
    } catch {
        return null;
    }
}

function AdminOrderCreatedAtCell({ createdAt }: { createdAt?: string | null }) {
    const parts = formatOrderCreatedParts(createdAt);
    if (!parts) {
        return "—";
    }
    return (
        <div className="flex flex-col leading-tight">
            <span className="whitespace-nowrap">{parts.date}</span>
            <span className="whitespace-nowrap text-[10px] text-admin-text-secondary">{parts.time}</span>
        </div>
    );
}

function normalizeAddressLine(value?: string | null): string {
    return value?.trim() || "—";
}

/** В таблице показываем короткое имя населённого пункта (без области и случайно попавшего адреса). */
function formatOrderCityDisplay(city?: string | null): string {
    const raw = city?.trim() || "";
    if (!raw) {
        return "—";
    }

    const commaIdx = raw.indexOf(",");
    const withoutRegion = commaIdx === -1 ? raw : raw.slice(0, commaIdx).trim();
    const addressMarkerMatch = withoutRegion.match(/\s(?:ул\.?|улица|пр-т|просп\.?|проспект|пер\.?|переулок|д\.?|дом|кв\.?)/iu);

    return (addressMarkerMatch ? withoutRegion.slice(0, addressMarkerMatch.index).trim() : withoutRegion) || "—";
}

function AdminOrderCellTooltip({
    tooltip,
    onMouseEnterAction,
    onMouseLeaveAction,
}: {
    tooltip: AddressTooltipState;
    onMouseEnterAction: () => void;
    onMouseLeaveAction: () => void;
}) {
    if (!tooltip || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            className="fixed z-[9999] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-admin-border bg-admin-surface px-3.5 py-3 text-sm leading-snug text-admin-text shadow-2xl ring-1 ring-black/5"
            style={{ left: tooltip.x, top: tooltip.y }}
            onMouseEnter={onMouseEnterAction}
            onMouseLeave={onMouseLeaveAction}
        >
            {tooltip.lines.map((line, index) => (
                <div
                    key={`${line}-${index}`}
                    className={index === 0 ? "select-text font-semibold" : "mt-1.5 select-text whitespace-pre-wrap text-admin-text-secondary"}
                >
                    {line}
                </div>
            ))}
        </div>,
        document.body,
    );
}

function getTooltipPosition(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    const viewportPadding = 16;
    const tooltipHalfWidth = Math.min(192, Math.max(0, window.innerWidth / 2 - viewportPadding));

    return {
        x: Math.min(
            Math.max(rect.left + rect.width / 2, tooltipHalfWidth + viewportPadding),
            window.innerWidth - tooltipHalfWidth - viewportPadding,
        ),
        y: rect.bottom + 8,
    };
}

function isTextOverflowing(element: HTMLElement): boolean {
    return element.scrollWidth > element.clientWidth + 1;
}

function AdminOrderClientCell({
    name,
    searchQuery,
    onShowAction,
    onHideAction,
}: {
    name?: string | null;
    searchQuery: string;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const clientName = name?.trim() || "—";
    const hasClient = clientName !== "—";

    const showTooltip = (element: HTMLElement) => {
        if (!hasClient || !isTextOverflowing(element)) {
            onHideAction();
            return;
        }

        onShowAction({
            lines: [clientName],
            ...getTooltipPosition(element),
        });
    };

    return (
        <div
            className="min-w-0 truncate"
            tabIndex={hasClient ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            {highlightQueryInText(clientName, searchQuery)}
        </div>
    );
}

function AdminOrderAddressCell({
    city,
    address,
    onShowAction,
    onHideAction,
}: {
    city?: string | null;
    address?: string | null;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const cityRaw = city?.trim() || "";
    const cityLine = formatOrderCityDisplay(city);
    const addressLine = normalizeAddressLine(address);
    const hasAddress = cityLine !== "—" || addressLine !== "—";
    const tooltipCity = cityRaw || cityLine;
    const cityWasShortened = cityRaw !== "" && cityRaw !== cityLine;

    const showTooltip = (element: HTMLElement) => {
        const truncatedLine = Array.from(
            element.querySelectorAll<HTMLElement>("[data-truncate-check]"),
        ).some(isTextOverflowing);

        if (!hasAddress || (!truncatedLine && !cityWasShortened)) {
            onHideAction();
            return;
        }

        onShowAction({
            lines: [tooltipCity, addressLine],
            ...getTooltipPosition(element),
        });
    };

    return (
        <div
            className="min-w-0 leading-tight"
            tabIndex={hasAddress ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            <div className="truncate font-medium text-admin-text" data-truncate-check>
                {cityLine}
            </div>
            <div className="truncate text-[10px] text-admin-text-secondary" data-truncate-check>
                {addressLine}
            </div>
        </div>
    );
}

export default function AdminOrdersTable({
    initialOrders,
    searchQuery = "",
    onSuccessMessageAction,
    onErrorMessageAction,
    dateFilterSummary,
    onDateFilterHeaderClickAction,
    selectedOrderIds = [],
    onSelectedOrderIdsChangeAction,
}: Props) {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [orderDetailLoading, setOrderDetailLoading] = useState(false);
    const [terminalConfirm, setTerminalConfirm] = useState<{ orderId: number; nextStatus: "done" | "cancelled" } | null>(
        null,
    );
    const [addressTooltip, setAddressTooltip] = useState<AddressTooltipState>(null);
    const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isStatusPending, startStatusTransition] = useTransition();

    const clearTooltipHideTimer = useCallback(() => {
        if (tooltipHideTimerRef.current) {
            clearTimeout(tooltipHideTimerRef.current);
            tooltipHideTimerRef.current = null;
        }
    }, []);

    const showAddressTooltip = useCallback((tooltip: AddressTooltipState) => {
        clearTooltipHideTimer();
        setAddressTooltip(tooltip);
    }, [clearTooltipHideTimer]);

    const hideAddressTooltip = useCallback(() => {
        clearTooltipHideTimer();
        setAddressTooltip(null);
    }, [clearTooltipHideTimer]);

    const hideAddressTooltipWithDelay = useCallback(() => {
        clearTooltipHideTimer();
        tooltipHideTimerRef.current = setTimeout(() => {
            setAddressTooltip(null);
            tooltipHideTimerRef.current = null;
        }, 220);
    }, [clearTooltipHideTimer]);

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    useEffect(() => {
        if (!addressTooltip) {
            return;
        }

        window.addEventListener("scroll", hideAddressTooltip, true);
        return () => window.removeEventListener("scroll", hideAddressTooltip, true);
    }, [addressTooltip, hideAddressTooltip]);

    const selectedOrderIdsSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
    const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIdsSet.has(order.id));

    const toggleOrderSelection = (orderId: number) => {
        if (!onSelectedOrderIdsChangeAction) {
            return;
        }

        const next = new Set(selectedOrderIds);
        if (next.has(orderId)) {
            next.delete(orderId);
        } else {
            next.add(orderId);
        }
        onSelectedOrderIdsChangeAction(Array.from(next));
    };

    const toggleVisibleSelection = () => {
        if (!onSelectedOrderIdsChangeAction) {
            return;
        }

        const visibleIds = orders.map((order) => order.id);
        const next = new Set(selectedOrderIds);
        if (allVisibleSelected) {
            visibleIds.forEach((id) => next.delete(id));
        } else {
            visibleIds.forEach((id) => next.add(id));
        }
        onSelectedOrderIdsChangeAction(Array.from(next));
    };

    const handleStatusChange = (orderId: number, status: string) => {
        startStatusTransition(async () => {
            try {
                onErrorMessageAction?.("");
                onSuccessMessageAction?.("");

                const response = await updateOrderStatus(orderId, status);

                setOrders((prev) =>
                    prev.map((order) =>
                        order.id === orderId ? { ...order, ...response.data } : order
                    )
                );

                setSelectedOrder((prev) =>
                    prev && prev.id === orderId ? { ...prev, ...response.data } : prev
                );

                onSuccessMessageAction?.("Статус заказа обновлён");
                setTerminalConfirm(null);
            } catch (error) {
                console.error(error);
                onErrorMessageAction?.("Не удалось обновить статус");
                setTerminalConfirm(null);
            }
        });
    };

    const requestStatusChange = (orderId: number, currentStatus: string, nextStatus: string) => {
        if (nextStatus === currentStatus) {
            return;
        }
        if (TERMINAL_STATUSES.has(nextStatus)) {
            setTerminalConfirm({
                orderId,
                nextStatus: nextStatus as "done" | "cancelled",
            });
            return;
        }
        handleStatusChange(orderId, nextStatus);
    };

    const openOrderDetail = (orderId: number) => {
        setOrderDetailLoading(true);
        setSelectedOrder(null);
        void fetchOrder(orderId)
            .then((res) => {
                setSelectedOrder(res.data);
            })
            .catch((error) => {
                console.error(error);
                onErrorMessageAction?.("Не удалось загрузить заказ");
            })
            .finally(() => {
                setOrderDetailLoading(false);
            });
    };

    return (
        <>
            <div className="w-full rounded-lg border border-admin-border bg-admin-surface shadow-sm">
                <table className="w-full table-fixed border-collapse text-[13px]">
                    <thead className="bg-admin-muted/80">
                        <tr className="border-b border-admin-border text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                            <th className="w-[4%] border-r border-admin-border px-2 py-2">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleVisibleSelection}
                                    aria-label="Выбрать все заказы на странице"
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                            </th>
                            <th className="w-[10%] border-r border-admin-border px-2 py-2">Заказ</th>
                            <th className="w-[16%] border-r border-admin-border px-2 py-2">Клиент</th>
                            <th className="w-[12%] border-r border-admin-border px-2 py-2">Телефон</th>
                            <th className="w-[22%] border-r border-admin-border px-2 py-2">Адрес</th>
                            <th className="w-[13%] border-r border-admin-border px-2 py-2">Статус</th>
                            <th className="w-[6%] border-r border-admin-border px-2 py-2">Кол.</th>
                            <th className="w-[9%] border-r border-admin-border px-2 py-2">Сумма</th>
                            <th className="w-[8%] px-2 py-2 align-top">
                                {onDateFilterHeaderClickAction !== undefined && dateFilterSummary !== undefined ? (
                                    <button
                                        type="button"
                                        onClick={onDateFilterHeaderClickAction}
                                        className="flex max-w-full flex-col items-start rounded-md border border-transparent px-1 py-0.5 text-left transition hover:border-admin-border hover:bg-admin-surface focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        aria-label="Фильтр по дате создания заказа"
                                    >
                                        <span className="tracking-wide text-admin-text-secondary">Дата</span>
                                        <span className="max-w-full truncate text-[10px] font-medium normal-case leading-snug text-admin-text">
                                            {dateFilterSummary}
                                        </span>
                                    </button>
                                ) : (
                                    "Дата"
                                )}
                            </th>
                        </tr>
                    </thead>

                    <tbody className="align-middle">
                        {orders.map((order) => (
                            <tr key={order.id} className="border-b border-admin-border/70 transition-colors last:border-b-0 hover:bg-admin-muted/35">
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedOrderIdsSet.has(order.id)}
                                        onChange={() => toggleOrderSelection(order.id)}
                                        aria-label={`Выбрать заказ #${order.id}`}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <button
                                            type="button"
                                            className="min-w-0 truncate text-left font-medium text-blue-600 underline decoration-blue-600/80 underline-offset-2 hover:text-blue-700 hover:decoration-blue-700"
                                            onClick={() => openOrderDetail(order.id)}
                                        >
                                            #{highlightQueryInText(String(order.id), searchQuery)}
                                        </button>
                                        <Link
                                            href={`/admin/orders/${order.id}/edit`}
                                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-admin-border text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                            aria-label={`Редактировать заказ #${order.id}`}
                                        >
                                            <Pencil size={12} />
                                        </Link>
                                    </div>
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <AdminOrderClientCell
                                        name={order.customer_name}
                                        searchQuery={searchQuery}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <div className="truncate">{highlightQueryInText(order.phone || "—", searchQuery)}</div>
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <AdminOrderAddressCell
                                        city={order.delivery_city}
                                        address={order.delivery_address}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <AdminStatusDropdown
                                        value={order.status}
                                        options={ORDER_STATUS_OPTIONS}
                                        onChangeAction={(nextStatus) =>
                                            requestStatusChange(order.id, order.status, nextStatus)
                                        }
                                        disabled={order.status === "done" || order.status === "cancelled"}
                                        triggerVariant="text"
                                        triggerTextClassName={getOrderStatusTableTextClass(order.status)}
                                        menuWidthClassName={STATUS_DROPDOWN_MENU_WIDTH_CLASS}
                                    />
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2 text-right tabular-nums">{order.items_qty}</td>
                                <td className="border-r border-admin-border/70 px-2 py-2 whitespace-nowrap text-right tabular-nums">{order.total} руб.</td>
                                <td className="px-2 py-2 text-admin-text-secondary">
                                    <AdminOrderCreatedAtCell createdAt={order.created_at} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <AdminOrderCellTooltip
                tooltip={addressTooltip}
                onMouseEnterAction={clearTooltipHideTimer}
                onMouseLeaveAction={hideAddressTooltipWithDelay}
            />

            <AdminOrderItemsModal
                order={selectedOrder}
                orderDetailLoading={orderDetailLoading}
                onCloseAction={() => {
                    setSelectedOrder(null);
                    setOrderDetailLoading(false);
                }}
            />

            <AdminConfirmDialog
                open={terminalConfirm !== null}
                title={
                    terminalConfirm?.nextStatus === "done"
                        ? "Перевести заказ в «Выполнен»?"
                        : "Перевести заказ в «Отменён»?"
                }
                message={
                    terminalConfirm?.nextStatus === "done"
                        ? "Для статуса «Выполнен» будет создано складское списание по резервам, начисление по карте лояльности и выпуск купленных подарочных сертификатов (если применимо). Позже состав заказа изменить будет нельзя."
                        : "Для статуса «Отменён» будут сняты резервы на складе и выполнен возврат по подарочным сертификатам заказа (если применимо). Позже состав заказа изменить будет нельзя."
                }
                confirmText={terminalConfirm?.nextStatus === "done" ? "Выполнить" : "Отменить заказ"}
                confirmLoadingText="Сохранение..."
                cancelText="Назад"
                loading={isStatusPending}
                onCloseAction={() => setTerminalConfirm(null)}
                onConfirmAction={() => {
                    if (!terminalConfirm) {
                        return;
                    }
                    handleStatusChange(terminalConfirm.orderId, terminalConfirm.nextStatus);
                }}
            />
        </>
    );
}