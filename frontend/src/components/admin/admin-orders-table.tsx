"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MessageSquare, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { OrderData, OrderItem } from "@/types/orders";
import { fetchOrder, updateOrderAdminFields, updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusTableTextClass, ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminDeliveryTimeInput, {
    formatDeliveryClockTime,
    snapDeliveryClockToTenMinutes,
} from "@/components/admin/orders/admin-delivery-time-input";
import { formatMoneyRub } from "@/lib/format-money-display";
import { adminCheckbox } from "@/lib/admin-ui-classes";

type Props = {
    initialOrders: OrderData[];
    searchQuery?: string;
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
    /** Открыть попап фильтра по дате доставки (из заголовка колонки). */
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

type ItemsTooltipState = {
    items: OrderItem[];
    x: number;
    y: number;
} | null;

function orderItemTooltipTitle(item: OrderItem): string {
    const name = item.product_name?.trim() || "Товар";
    const variant = item.variant_title?.trim() || "";
    return variant ? `${name} — ${variant}` : name;
}

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

function formatOrderDeliveryDate(value?: string | null): string {
    if (!value) {
        return "—";
    }
    try {
        const d = new Date(`${value}T12:00:00`);
        if (Number.isNaN(d.getTime())) {
            return "—";
        }
        return d.toLocaleDateString("ru-RU");
    } catch {
        return "—";
    }
}

function tagContrastText(hex: string): string {
    const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/i);
    if (!m) return "#fff";
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.62 ? "#111827" : "#ffffff";
}

function AdminOrderClientPhoneCell({
    name,
    phone,
    searchQuery,
    onShowAction,
    onHideAction,
}: {
    name?: string | null;
    phone?: string | null;
    searchQuery: string;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const clientName = name?.trim() || "—";
    const phoneText = phone?.trim() || "—";
    const hasContent = clientName !== "—" || phoneText !== "—";

    const showTooltip = (element: HTMLElement) => {
        const truncatedLine = Array.from(
            element.querySelectorAll<HTMLElement>("[data-truncate-check]"),
        ).some(isTextOverflowing);

        if (!hasContent || !truncatedLine) {
            onHideAction();
            return;
        }

        onShowAction({
            lines: [phoneText, clientName],
            ...getTooltipPosition(element),
        });
    };

    return (
        <div
            className="min-w-0 leading-tight"
            tabIndex={hasContent ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            <div className="truncate font-semibold text-admin-text" data-truncate-check>
                {highlightQueryInText(phoneText, searchQuery)}
            </div>
            <div className="truncate text-[10px] text-admin-text-secondary" data-truncate-check>
                {highlightQueryInText(clientName, searchQuery)}
            </div>
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
            className="fixed z-[9999] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-admin-border bg-admin-surface px-3.5 py-3 text-sm leading-snug text-admin-text shadow-2xl ring-1 ring-black/5"
            style={{ left: tooltip.x, top: tooltip.y }}
            onMouseEnter={onMouseEnterAction}
            onMouseLeave={onMouseLeaveAction}
        >
            {tooltip.lines.map((line, index) => (
                <div
                    key={`${line}-${index}`}
                    className={
                        index === 0
                            ? "select-text whitespace-pre-wrap font-semibold"
                            : "mt-1.5 select-text whitespace-pre-wrap text-admin-text-secondary"
                    }
                >
                    {line}
                </div>
            ))}
        </div>,
        document.body,
    );
}

function AdminOrderItemsTooltip({
    tooltip,
    onMouseEnterAction,
    onMouseLeaveAction,
}: {
    tooltip: ItemsTooltipState;
    onMouseEnterAction: () => void;
    onMouseLeaveAction: () => void;
}) {
    if (!tooltip || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            className="fixed z-[9999] max-w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2.5 text-xs leading-snug text-admin-text shadow-2xl ring-1 ring-black/5"
            style={{ left: tooltip.x, top: tooltip.y }}
            onMouseEnter={onMouseEnterAction}
            onMouseLeave={onMouseLeaveAction}
        >
            {tooltip.items.length === 0 ? (
                <div className="text-admin-text-secondary">Нет позиций</div>
            ) : (
                <ul className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto">
                    {tooltip.items.map((item) => (
                        <li key={item.id} className="border-b border-admin-border/60 pb-2 last:border-0 last:pb-0">
                            <div className="select-text font-medium text-admin-text">{orderItemTooltipTitle(item)}</div>
                            <div className="mt-0.5 flex justify-between gap-3 tabular-nums text-admin-text-secondary">
                                <span>
                                    {item.qty} × {formatMoneyRub(item.price)}
                                </span>
                                <span className="font-medium text-admin-text">{formatMoneyRub(item.total)}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>,
        document.body,
    );
}

function AdminOrderQtyCell({
    order,
    onShowAction,
    onHideAction,
}: {
    order: OrderData;
    onShowAction: (tooltip: ItemsTooltipState) => void;
    onHideAction: () => void;
}) {
    const items = order.items ?? [];

    const showTooltip = (element: HTMLElement) => {
        if (items.length === 0 && !order.items_qty) {
            onHideAction();
            return;
        }
        onShowAction({
            items,
            ...getTooltipPosition(element),
        });
    };

    return (
        <button
            type="button"
            className="w-full cursor-default text-right tabular-nums"
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
            aria-label={`Товары заказа #${order.id}`}
        >
            {order.items_qty}
        </button>
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

function AdminOrderDeliveryTimeCell({
    order,
    onSavedAction,
    onErrorAction,
}: {
    order: OrderData;
    onSavedAction: (order: OrderData) => void;
    onErrorAction?: (message: string) => void;
}) {
    const from = formatDeliveryClockTime(order.delivery_time_from);
    const to = formatDeliveryClockTime(order.delivery_time_to);
    const [open, setOpen] = useState(false);
    const [draftFrom, setDraftFrom] = useState("");
    const [draftTo, setDraftTo] = useState("");
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        setDraftFrom(from ? snapDeliveryClockToTenMinutes(from) : "");
        setDraftTo(to ? snapDeliveryClockToTenMinutes(to) : "");
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await updateOrderAdminFields(order.id, {
                delivery_time_from: draftFrom.trim() || null,
                delivery_time_to: draftTo.trim() || null,
            });
            onSavedAction(res.data);
            setOpen(false);
        } catch (error) {
            console.error(error);
            onErrorAction?.("Не удалось сохранить время доставки");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openEditor}
                className="block w-full rounded-lg px-0.5 py-0.5 text-left tabular-nums leading-snug text-admin-text transition hover:bg-admin-muted"
                aria-label={`Время доставки заказа #${order.id}`}
                title="Задать время доставки"
            >
                {from || to ? (
                    <>
                        <span className="block">{from || "—"}</span>
                        <span className="block text-admin-text-secondary">{to || "—"}</span>
                    </>
                ) : (
                    <span className="text-admin-text-secondary">—</span>
                )}
            </button>
            <AdminModalShell
                open={open}
                onCloseAction={() => !saving && setOpen(false)}
                title={`Время доставки #${order.id}`}
                maxWidthClass="sm:max-w-md"
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => setOpen(false)}
                            className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-admin-text-secondary hover:bg-admin-muted"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void save()}
                            className="rounded-lg bg-admin-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                        >
                            {saving ? "Сохранение…" : "Сохранить"}
                        </button>
                    </div>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-admin-text-secondary">
                        С
                        <div className="mt-1">
                            <AdminDeliveryTimeInput value={draftFrom} onChangeAction={setDraftFrom} disabled={saving} />
                        </div>
                    </label>
                    <label className="text-sm text-admin-text-secondary">
                        По
                        <div className="mt-1">
                            <AdminDeliveryTimeInput value={draftTo} onChangeAction={setDraftTo} disabled={saving} />
                        </div>
                    </label>
                </div>
            </AdminModalShell>
        </>
    );
}

function AdminOrderManagerCommentButton({
    order,
    onSavedAction,
    onErrorAction,
    onShowAction,
    onHideAction,
}: {
    order: OrderData;
    onSavedAction: (order: OrderData) => void;
    onErrorAction?: (message: string) => void;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const commentText = order.manager_comment?.trim() || "";
    const hasComment = Boolean(commentText);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(order.manager_comment ?? "");
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        onHideAction();
        setDraft(order.manager_comment ?? "");
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await updateOrderAdminFields(order.id, {
                manager_comment: draft.trim() || null,
            });
            onSavedAction(res.data);
            setOpen(false);
        } catch (error) {
            console.error(error);
            onErrorAction?.("Не удалось сохранить комментарий менеджера");
        } finally {
            setSaving(false);
        }
    };

    const showTooltip = (element: HTMLElement) => {
        if (!hasComment) {
            onHideAction();
            return;
        }
        onShowAction({
            lines: [commentText],
            ...getTooltipPosition(element),
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={openEditor}
                onMouseEnter={(event) => showTooltip(event.currentTarget)}
                onMouseLeave={onHideAction}
                onFocus={(event) => showTooltip(event.currentTarget)}
                onBlur={onHideAction}
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                    hasComment
                        ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-admin-border text-admin-text-secondary hover:bg-admin-muted hover:text-admin-text"
                }`}
                aria-label={
                    hasComment
                        ? `Комментарий менеджера по заказу #${order.id}`
                        : `Добавить комментарий менеджера к заказу #${order.id}`
                }
                title={hasComment ? undefined : "Добавить комментарий менеджера"}
            >
                <MessageSquare size={12} />
            </button>
            <AdminModalShell
                open={open}
                onCloseAction={() => !saving && setOpen(false)}
                title={`Комментарий менеджера #${order.id}`}
                maxWidthClass="sm:max-w-md"
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => setOpen(false)}
                            className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-admin-text-secondary hover:bg-admin-muted"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void save()}
                            className="rounded-lg bg-admin-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                        >
                            {saving ? "Сохранение…" : "Сохранить"}
                        </button>
                    </div>
                }
            >
                <label className="block text-sm text-admin-text-secondary">
                    Виден только в админке
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={5}
                        className="mt-1 w-full rounded-lg border border-admin-border px-3 py-2 text-sm text-admin-text"
                        placeholder="Заметка для менеджеров…"
                    />
                </label>
            </AdminModalShell>
        </>
    );
}

export default function AdminOrdersTable({
    initialOrders,
    searchQuery = "",
    onSuccessMessageAction,
    onErrorMessageAction,
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
    const [itemsTooltip, setItemsTooltip] = useState<ItemsTooltipState>(null);
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
        setItemsTooltip(null);
        setAddressTooltip(tooltip);
    }, [clearTooltipHideTimer]);

    const showItemsTooltip = useCallback((tooltip: ItemsTooltipState) => {
        clearTooltipHideTimer();
        setAddressTooltip(null);
        setItemsTooltip(tooltip);
    }, [clearTooltipHideTimer]);

    const hideAddressTooltip = useCallback(() => {
        clearTooltipHideTimer();
        setAddressTooltip(null);
    }, [clearTooltipHideTimer]);

    const hideItemsTooltip = useCallback(() => {
        clearTooltipHideTimer();
        setItemsTooltip(null);
    }, [clearTooltipHideTimer]);

    const hideAddressTooltipWithDelay = useCallback(() => {
        clearTooltipHideTimer();
        tooltipHideTimerRef.current = setTimeout(() => {
            setAddressTooltip(null);
            tooltipHideTimerRef.current = null;
        }, 220);
    }, [clearTooltipHideTimer]);

    const hideItemsTooltipWithDelay = useCallback(() => {
        clearTooltipHideTimer();
        tooltipHideTimerRef.current = setTimeout(() => {
            setItemsTooltip(null);
            tooltipHideTimerRef.current = null;
        }, 220);
    }, [clearTooltipHideTimer]);

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    useEffect(() => {
        if (!addressTooltip && !itemsTooltip) {
            return;
        }

        const hide = () => {
            hideAddressTooltip();
            hideItemsTooltip();
        };
        window.addEventListener("scroll", hide, true);
        return () => window.removeEventListener("scroll", hide, true);
    }, [addressTooltip, itemsTooltip, hideAddressTooltip, hideItemsTooltip]);

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

    const patchOrderInList = useCallback((updated: OrderData) => {
        setOrders((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        setSelectedOrder((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    }, []);

    return (
        <>
            <div className="overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] table-fixed border-collapse text-[13px]">
                    <colgroup>
                        <col className="w-9" />
                        <col className="w-[7.25rem]" />
                        <col className="w-[7.75rem]" />
                        <col />
                        <col />
                        <col className="w-[4.5rem]" />
                        <col className="w-[8.5rem]" />
                        <col className="w-[3.25rem]" />
                        <col className="w-[6.5rem]" />
                        <col className="w-[8rem]" />
                    </colgroup>
                    <thead className="bg-admin-muted/80">
                        <tr className="border-b border-admin-border text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                            <th className="border-r border-admin-border px-2 py-2">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleVisibleSelection}
                                    aria-label="Выбрать все заказы на странице"
                                    className={adminCheckbox}
                                />
                            </th>
                            <th className="border-r border-admin-border px-1.5 py-2">Заказ</th>
                            <th className="border-r border-admin-border px-2 py-2">
                                {onDateFilterHeaderClickAction !== undefined ? (
                                    <button
                                        type="button"
                                        onClick={onDateFilterHeaderClickAction}
                                        className="cursor-pointer bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary transition hover:font-bold hover:underline hover:underline-offset-2 focus:outline-none"
                                        aria-label="Фильтр по дате доставки"
                                    >
                                        Дата доставки
                                    </button>
                                ) : (
                                    "Дата доставки"
                                )}
                            </th>
                            <th className="border-r border-admin-border px-2 py-2">Клиент</th>
                            <th className="border-r border-admin-border px-2 py-2">Адрес</th>
                            <th className="border-r border-admin-border px-2 py-2">Время</th>
                            <th className="border-r border-admin-border px-2 py-2">Статус</th>
                            <th className="border-r border-admin-border px-2 py-2">Кол.</th>
                            <th className="border-r border-admin-border px-2 py-2">Сумма</th>
                            <th className="px-2 py-2">Теги</th>
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
                                        className={adminCheckbox}
                                    />
                                </td>
                                <td className="overflow-hidden border-r border-admin-border/70 px-1.5 py-2">
                                    <div className="flex w-max max-w-full items-center gap-1">
                                        <button
                                            type="button"
                                            className="shrink-0 text-left font-medium tabular-nums text-blue-600 underline decoration-blue-600/80 underline-offset-2 hover:text-blue-700 hover:decoration-blue-700"
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
                                        <AdminOrderManagerCommentButton
                                            order={order}
                                            onSavedAction={patchOrderInList}
                                            onErrorAction={onErrorMessageAction}
                                            onShowAction={showAddressTooltip}
                                            onHideAction={hideAddressTooltipWithDelay}
                                        />
                                    </div>
                                </td>
                                <td className="whitespace-nowrap border-r border-admin-border/70 px-2 py-2 tabular-nums text-admin-text">
                                    {formatOrderDeliveryDate(order.delivery_date)}
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2">
                                    <AdminOrderClientPhoneCell
                                        name={order.customer_name}
                                        phone={order.phone}
                                        searchQuery={searchQuery}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
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
                                    <AdminOrderDeliveryTimeCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
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
                                <td className="border-r border-admin-border/70 px-2 py-2 text-right tabular-nums">
                                    <AdminOrderQtyCell
                                        order={order}
                                        onShowAction={showItemsTooltip}
                                        onHideAction={hideItemsTooltipWithDelay}
                                    />
                                </td>
                                <td className="border-r border-admin-border/70 px-2 py-2 whitespace-nowrap text-right tabular-nums">
                                    {order.total} руб.
                                </td>
                                <td className="px-2 py-2">
                                    {(order.tags ?? []).length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {(order.tags ?? []).map((tag) => (
                                                <span
                                                    key={tag.id}
                                                    className="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight"
                                                    style={{
                                                        backgroundColor: tag.color,
                                                        color: tagContrastText(tag.color),
                                                    }}
                                                    title={tag.name}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-admin-text-secondary">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            <AdminOrderCellTooltip
                tooltip={addressTooltip}
                onMouseEnterAction={clearTooltipHideTimer}
                onMouseLeaveAction={hideAddressTooltipWithDelay}
            />

            <AdminOrderItemsTooltip
                tooltip={itemsTooltip}
                onMouseEnterAction={clearTooltipHideTimer}
                onMouseLeaveAction={hideItemsTooltipWithDelay}
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