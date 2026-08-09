"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MessageSquare, Pencil, ChevronDown, Check, Truck, GripVertical } from "lucide-react";
import { isVeterInTransitStatus, veterOrderUrl } from "@/constants/veter";
import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";
import type { OrderData, OrderItem } from "@/types/orders";
import { fetchOrder, updateOrderAdminFields, updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusLabel, getOrderStatusColor, solidColorPillStyle, SOLID_PILL_CHIP_CLASS, orderStatusSoftBg } from "@/constants/order-statuses";
import { useOrderStatusOptions, type OrderStatusOption } from "@/hooks/use-order-status-options";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminDeliveryTimeInput, {
    AdminDeliveryTimePresets,
    formatDeliveryClockTime,
    snapDeliveryClockToTenMinutes,
} from "@/components/admin/orders/admin-delivery-time-input";
import AdminDatePicker from "@/components/admin/orders/admin-date-picker";
import AdminOrderTagsPicker from "@/components/admin/orders/admin-order-tags-picker";
import type { OrderTag } from "@/lib/admin-order-tags-api";
import { formatMoneyRub } from "@/lib/format-money-display";
import { formatDeliveryAddressLine } from "@/lib/format-delivery-address";
import { adminCheckbox } from "@/lib/admin-ui-classes";
import { telHref } from "@/lib/site-contact";
import { lineItemFullTitle } from "@/lib/product-display-name";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type Props = {
    initialOrders: OrderData[];
    searchQuery?: string;
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
    /** Открыть попап фильтра по дате доставки (из заголовка колонки). */
    onDateFilterHeaderClickAction?: () => void;
    /** Перезагрузить список заказов (после смены даты доставки и т.п.). */
    onOrdersReloadAction?: () => void;
    statusFilter?: string;
    onStatusFilterChangeAction?: (status: string) => void;
    selectedOrderIds?: number[];
    onSelectedOrderIdsChangeAction?: (ids: number[]) => void;
    /**
     * Дефолтный список без фильтров: done/cancelled на API не отдаются —
     * после смены статуса убираем строку из таблицы сразу.
     */
    hideTerminalStatuses?: boolean;
};

const STATUS_DROPDOWN_MENU_WIDTH_CLASS = "w-max max-w-[11.5rem]";

const COMPLETED_STATUSES = new Set(["done", "completed"]);
const DEFAULT_LIST_HIDDEN_STATUSES = new Set(["done", "cancelled", "completed"]);

function isOrderDeliveryOverdue(order: OrderData, todayIso: string): boolean {
    const status = (order.status ?? "").trim();
    if (status === "done" || status === "cancelled" || status === "completed") {
        return false;
    }
    const shipmentDate = order.shipment_date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(shipmentDate)) {
        return false;
    }
    return shipmentDate.slice(0, 10) < todayIso;
}

type AddressTooltipState = {
    lines: string[];
    /** Дата доставки (YYYY-MM-DD) — только для тултипа адреса. */
    deliveryDate?: string | null;
    x: number;
    /** Нижний край якорного элемента (для размещения снизу). */
    anchorBottom: number;
    /** Верхний край якорного элемента (для размещения сверху). */
    anchorTop: number;
} | null;

type ItemsTooltipState = {
    items: OrderItem[];
    x: number;
    anchorTop: number;
    anchorBottom: number;
} | null;

const PRODUCTS_COL_MIN_PX = 72;
const PRODUCTS_COL_MAX_PX = 560;

function orderItemTooltipTitle(item: OrderItem): string {
    return lineItemFullTitle(item);
}

function OrdersStatusFilterHeader({
    value,
    options,
    onChangeAction,
}: {
    value: string;
    options: OrderStatusOption[];
    onChangeAction: (status: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const hasFilter = value.trim() !== "";
    const label = hasFilter
        ? options.find((item) => item.value === value)?.label ?? getOrderStatusLabel(value)
        : "Статус";

    useLayoutEffect(() => {
        if (!isOpen) {
            return;
        }
        const trigger = triggerRef.current;
        const menu = menuRef.current;
        if (!trigger || !menu) {
            return;
        }
        const rect = trigger.getBoundingClientRect();
        const menuWidth = Math.min(200, Math.max(0, window.innerWidth - 24));
        const menuHeight = Math.min(320, (options.length + 1) * 36 + 12);
        const pad = 8;
        const gap = 6;
        let left = rect.left;
        if (window.innerWidth - rect.left < menuWidth + pad) {
            left = rect.right - menuWidth;
        }
        left = Math.min(Math.max(pad, left), window.innerWidth - menuWidth - pad);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight + pad && rect.top > spaceBelow;

        menu.style.width = `${menuWidth}px`;
        menu.style.left = `${left}px`;
        if (openUp) {
            menu.style.top = "auto";
            menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
        } else {
            menu.style.bottom = "auto";
            menu.style.top = `${rect.bottom + gap}px`;
        }
        menu.style.visibility = "visible";
    }, [isOpen, options.length]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const applyMenuPosition = () => {
            const trigger = triggerRef.current;
            const menu = menuRef.current;
            if (!trigger || !menu) {
                return;
            }
            const rect = trigger.getBoundingClientRect();
            const menuWidth = Math.min(200, Math.max(0, window.innerWidth - 24));
            const menuHeight = Math.min(320, (options.length + 1) * 36 + 12);
            const pad = 8;
            const gap = 6;
            let left = rect.left;
            if (window.innerWidth - rect.left < menuWidth + pad) {
                left = rect.right - menuWidth;
            }
            left = Math.min(Math.max(pad, left), window.innerWidth - menuWidth - pad);
            const spaceBelow = window.innerHeight - rect.bottom;
            const openUp = spaceBelow < menuHeight + pad && rect.top > spaceBelow;

            menu.style.width = `${menuWidth}px`;
            menu.style.left = `${left}px`;
            if (openUp) {
                menu.style.top = "auto";
                menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
            } else {
                menu.style.bottom = "auto";
                menu.style.top = `${rect.bottom + gap}px`;
            }
            menu.style.visibility = "visible";
        };

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setIsOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown, { passive: true });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", applyMenuPosition);
        window.addEventListener("scroll", applyMenuPosition, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", applyMenuPosition);
            window.removeEventListener("scroll", applyMenuPosition, true);
        };
    }, [isOpen, options.length]);

    const menu =
        isOpen && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={menuRef}
                      className="fixed z-[9999] max-h-[min(20rem,70vh)] overflow-y-auto rounded-lg border border-admin-border bg-admin-surface p-1 shadow-lg"
                      style={{ visibility: "hidden" }}
                      role="listbox"
                      aria-label="Фильтр по статусу"
                  >
                      <button
                          type="button"
                          role="option"
                          aria-selected={!hasFilter}
                          onClick={() => {
                              onChangeAction("");
                              setIsOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-admin-muted ${
                              !hasFilter ? "font-medium text-admin-text" : "text-admin-text-secondary"
                          }`}
                      >
                          <span>Все статусы</span>
                          {!hasFilter ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} /> : null}
                      </button>
                      {options.map((option) => {
                          const selected = value === option.value;
                          return (
                              <button
                                  key={option.value}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                      onChangeAction(option.value);
                                      setIsOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-admin-muted ${
                                      selected ? "font-medium text-admin-text" : "text-admin-text-secondary"
                                  }`}
                              >
                                  <span>{option.label}</span>
                                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} /> : null}
                              </button>
                          );
                      })}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className={`inline-flex max-w-full cursor-pointer items-center gap-0.5 bg-transparent p-0 text-left text-[10px] font-bold uppercase tracking-[0.08em] transition hover:scale-[1.04] hover:text-admin-text hover:underline hover:underline-offset-2 focus:outline-none ${
                    hasFilter || isOpen ? "text-admin-text" : "text-admin-text-secondary"
                }`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label="Фильтр по статусу"
                title={hasFilter ? `Статус: ${label}` : "Фильтр по статусу"}
            >
                <span className="truncate">{hasFilter ? label : "Статус"}</span>
                <ChevronDown
                    aria-hidden
                    strokeWidth={2.25}
                    className={`h-3 w-3 shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {menu}
        </>
    );
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

const WEEKDAY_SHORT_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

function weekdayShortFromIso(value?: string | null): string | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    const d = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return WEEKDAY_SHORT_RU[d.getDay()] ?? null;
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
    const callHref = phoneText !== "—" ? telHref(phoneText) : "";
    const hasContent = clientName !== "—" || phoneText !== "—";

    const showTooltip = (element: HTMLElement) => {
        const nameEl = element.querySelector<HTMLElement>("[data-client-name]");
        const nameTruncated = nameEl ? isTextOverflowing(nameEl) : false;

        if (!hasContent || !nameTruncated) {
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
            {callHref ? (
                <a
                    href={callHref}
                    className="block truncate font-semibold text-admin-text underline-offset-2 hover:underline lg:pointer-events-none lg:no-underline"
                    onClick={(event) => event.stopPropagation()}
                >
                    {highlightQueryInText(phoneText, searchQuery)}
                </a>
            ) : (
                <div className="truncate font-semibold text-admin-text">
                    {highlightQueryInText(phoneText, searchQuery)}
                </div>
            )}
            <div
                className="truncate text-[10px] text-admin-text-secondary"
                data-client-name
                data-truncate-check
            >
                {highlightQueryInText(clientName, searchQuery)}
            </div>
        </div>
    );
}

function formatOrderCityDisplay(city?: string | null): string {
    const raw = city?.trim() || "";
    if (!raw) {
        return "—";
    }

    // «Красносельский гп. (Волковысский р/н)» → «Красносельский гп.»
    // «Большие Лепесы д. (…)» → «Большие Лепесы д.» (тип НП «д.» не режем как «дом»)
    const withoutDistrict = raw.replace(/\s*\([^)]*\)\s*$/u, "").trim() || raw;
    const commaIdx = withoutDistrict.indexOf(",");
    const withoutRegion = commaIdx === -1 ? withoutDistrict : withoutDistrict.slice(0, commaIdx).trim();
    const addressMarkerMatch = withoutRegion.match(
        /\s(?:ул\.?|улица|пр-т|просп\.?|проспект|пер\.?|переулок|д\.?\s*\d|дом\s*\d|кв\.?\s*\d)/iu,
    );

    return (addressMarkerMatch ? withoutRegion.slice(0, addressMarkerMatch.index).trim() : withoutRegion) || "—";
}

function positionFixedTooltipEl(
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

function AdminOrderCellTooltip({
    tooltip,
    onMouseEnterAction,
    onMouseLeaveAction,
}: {
    tooltip: AddressTooltipState;
    onMouseEnterAction: () => void;
    onMouseLeaveAction: () => void;
}) {
    const ref = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!tooltip || !el) {
            return;
        }
        positionFixedTooltipEl(el, tooltip);
    }, [tooltip]);

    if (!tooltip || typeof document === "undefined") {
        return null;
    }

    const deliveryDate = tooltip.deliveryDate?.trim() || "";
    const deliveryLabel = formatOrderDeliveryDate(deliveryDate);
    const weekday = weekdayShortFromIso(deliveryDate);
    const showDelivery = Boolean(deliveryDate && deliveryLabel !== "—");

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-admin-border bg-admin-surface px-3.5 py-3 text-sm leading-snug text-admin-text shadow-2xl ring-1 ring-black/5"
            style={{
                left: tooltip.x,
                top: tooltip.anchorBottom + 8,
                visibility: "hidden",
            }}
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
            {showDelivery ? (
                <div
                    className={`flex flex-wrap items-center gap-1.5 ${
                        tooltip.lines.length > 0 ? "mt-2 border-t border-admin-border/70 pt-2" : ""
                    }`}
                >
                    <span className="text-[11px] text-admin-text-secondary">Доставка:</span>
                    {weekday ? (
                        <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                            {weekday}
                        </span>
                    ) : null}
                    <span className="tabular-nums text-sm font-medium text-admin-text">{deliveryLabel}</span>
                </div>
            ) : null}
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
    const ref = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!tooltip || !el) {
            return;
        }
        positionFixedTooltipEl(el, tooltip);
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
            className="block w-full min-w-0 cursor-default truncate text-center tabular-nums lg:text-left"
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
            aria-label={`Товары заказа #${order.id}`}
        >
            <span className="inline-block max-w-full truncate lg:hidden">{order.items_qty}</span>
            <span className="hidden min-w-0 space-y-0.5 lg:block">
                {items.length === 0 ? (
                    <span className="tabular-nums">{order.items_qty || "—"}</span>
                ) : (
                    items.map((item) => (
                        <div key={item.id} className="truncate leading-tight">
                            {lineItemFullTitle(item)}
                        </div>
                    ))
                )}
            </span>
        </button>
    );
}

function getTooltipPosition(element: HTMLElement): {
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

function isTextOverflowing(element: HTMLElement): boolean {
    return element.scrollWidth > element.clientWidth + 1;
}

function AdminOrderAddressCell({
    city,
    address,
    streetPrefix,
    house,
    korpus,
    apartment,
    deliveryDate,
    onShowAction,
    onHideAction,
}: {
    city?: string | null;
    address?: string | null;
    streetPrefix?: string | null;
    house?: string | null;
    korpus?: string | null;
    apartment?: string | null;
    deliveryDate?: string | null;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const cityRaw = city?.trim() || "";
    const cityLine = formatOrderCityDisplay(city);
    const addressLine =
        formatDeliveryAddressLine({
            prefix: streetPrefix,
            street: address,
            house,
            korpus,
            apartment,
        }) || "—";
    const hasAddress = cityLine !== "—" || addressLine !== "—";
    const deliveryIso = deliveryDate?.trim() || "";
    const hasDeliveryDate = Boolean(deliveryIso && /^\d{4}-\d{2}-\d{2}/.test(deliveryIso));
    const tooltipCity = cityRaw || cityLine;

    const showTooltip = (element: HTMLElement) => {
        const truncatedLine = Array.from(
            element.querySelectorAll<HTMLElement>("[data-truncate-check]"),
        ).some(isTextOverflowing);

        // «Доставка» только в тултипе — показываем при дате или обрезке адреса.
        if (!hasDeliveryDate && (!hasAddress || !truncatedLine)) {
            onHideAction();
            return;
        }

        onShowAction({
            lines: hasAddress ? [tooltipCity, addressLine] : [],
            deliveryDate: hasDeliveryDate ? deliveryIso.slice(0, 10) : null,
            ...getTooltipPosition(element),
        });
    };

    return (
        <div
            className="min-w-0 leading-tight"
            tabIndex={hasAddress || hasDeliveryDate ? 0 : undefined}
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

function AdminOrderShipmentIdCell({
    shipmentId,
    shipmentStatus,
    deliveryComment,
    searchQuery,
    onShowAction,
    onHideAction,
}: {
    shipmentId?: string | null;
    shipmentStatus?: string | null;
    deliveryComment?: string | null;
    searchQuery?: string;
    onShowAction: (tooltip: AddressTooltipState) => void;
    onHideAction: () => void;
}) {
    const id = shipmentId?.trim() || "";
    const status = shipmentStatus?.trim() || "";
    const comment = deliveryComment?.trim() || "";
    const inTransit = isVeterInTransitStatus(status);

    const showTooltip = (element: HTMLElement) => {
        if (!comment) {
            onHideAction();
            return;
        }
        onShowAction({
            lines: [comment],
            ...getTooltipPosition(element),
        });
    };

    if (!id) {
        return <span className="text-admin-text-secondary">—</span>;
    }

    const idContent = highlightQueryInText(id, searchQuery ?? "");

    return (
        <div
            className={`min-w-0 ${comment ? "cursor-default" : ""}`}
            tabIndex={comment ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            <div className="flex min-w-0 items-center gap-1 tabular-nums text-admin-text">
                {inTransit ? (
                    <Truck
                        size={12}
                        className="shrink-0 text-cyan-700"
                        aria-label="В пути"
                    />
                ) : null}
                {inTransit ? (
                    <a
                        href={veterOrderUrl(id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate text-cyan-700 underline-offset-2 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {idContent}
                    </a>
                ) : (
                    <span className="min-w-0 truncate">{idContent}</span>
                )}
            </div>
            {status ? (
                <div className="mt-0.5 truncate text-[11px] leading-tight text-admin-text-secondary">
                    {status}
                </div>
            ) : null}
        </div>
    );
}

function AdminOrderDeliveryDateCell({
    order,
    onSavedAction,
    onErrorAction,
    onReloadAction,
}: {
    order: OrderData;
    onSavedAction: (order: OrderData) => void;
    onErrorAction?: (message: string) => void;
    onReloadAction?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(order.shipment_date?.trim() || "");
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        setDraft(order.shipment_date?.trim() || format(new Date(), "yyyy-MM-dd"));
        setOpen(true);
    };

    const save = async () => {
        const next = draft.trim();
        if (!next) {
            onErrorAction?.("Укажите дату отправки");
            return;
        }
        setSaving(true);
        try {
            const res = await updateOrderAdminFields(order.id, {
                shipment_date: next,
            });
            onSavedAction(res.data);
            setOpen(false);
            onReloadAction?.();
        } catch (error) {
            console.error(error);
            onErrorAction?.("Не удалось сохранить дату отправки");
        } finally {
            setSaving(false);
        }
    };

    const label = formatOrderDeliveryDate(order.shipment_date);

    return (
        <>
            <button
                type="button"
                onClick={openEditor}
                className="inline-flex max-w-full rounded-lg px-0.5 py-0.5 text-left tabular-nums leading-none text-admin-text transition-transform duration-200 ease-out hover:scale-110"
                aria-label={`Дата отправки заказа #${order.id}`}
                title="Изменить дату отправки"
            >
                <span className="whitespace-nowrap">
                    {label !== "—" ? label : <span className="text-admin-text-secondary">—</span>}
                </span>
            </button>
            <AdminModalShell
                open={open}
                onCloseAction={() => !saving && setOpen(false)}
                title={`Дата отправки #${order.id}`}
                maxWidthClass="sm:max-w-sm"
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
                <div className="space-y-2">
                    <div className="text-sm text-admin-text-secondary">
                        Выбрано:{" "}
                        <span className="font-medium text-admin-text">
                            {draft.trim()
                                ? format(new Date(`${draft.trim()}T12:00:00`), "d MMMM yyyy", { locale: ru })
                                : "—"}
                        </span>
                    </div>
                    <AdminDatePicker value={draft} onChangeAction={setDraft} inline disabled={saving} />
                </div>
            </AdminModalShell>
        </>
    );
}

function AdminOrderTagsCell({
    order,
    onSavedAction,
    onErrorAction,
}: {
    order: OrderData;
    onSavedAction: (order: OrderData) => void;
    onErrorAction?: (message: string) => void;
}) {
    const tags = order.tags ?? [];
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<OrderTag[]>(() =>
        tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    );
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        setDraft((order.tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })));
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await updateOrderAdminFields(order.id, {
                tag_ids: draft.map((t) => t.id),
            });
            onSavedAction(res.data);
            setOpen(false);
        } catch (error) {
            console.error(error);
            onErrorAction?.("Не удалось сохранить теги заказа");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openEditor}
                className="inline-flex max-w-full rounded-lg px-0.5 py-0.5 text-left transition-transform duration-200 ease-out hover:scale-110"
                aria-label={`Теги заказа #${order.id}`}
                title="Изменить теги"
            >
                {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
                            <span
                                key={tag.id}
                                className={`${SOLID_PILL_CHIP_CLASS} truncate`}
                                style={solidColorPillStyle(tag.color)}
                                title={tag.name}
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-admin-text-secondary">—</span>
                )}
            </button>
            <AdminModalShell
                open={open}
                onCloseAction={() => !saving && setOpen(false)}
                title={`Теги заказа #${order.id}`}
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
                <AdminOrderTagsPicker selected={draft} onChangeAction={setDraft} compact />
            </AdminModalShell>
        </>
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
                className="inline-flex max-w-full flex-col rounded-lg px-0.5 py-0.5 text-left tabular-nums leading-none text-admin-text transition-transform duration-200 ease-out hover:scale-110"
                aria-label={`Время доставки заказа #${order.id}`}
                title="Задать время доставки"
            >
                {from || to ? (
                    <>
                        <span className="whitespace-nowrap">{from || "—"}</span>
                        <span className="mt-0.5 whitespace-nowrap text-admin-text-secondary">{to || "—"}</span>
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
                <div className="space-y-3">
                    <AdminDeliveryTimePresets
                        from={draftFrom}
                        to={draftTo}
                        disabled={saving}
                        onSelectAction={(nextFrom, nextTo) => {
                            setDraftFrom(nextFrom);
                            setDraftTo(nextTo);
                        }}
                    />
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
    onOrdersReloadAction,
    statusFilter = "",
    onStatusFilterChangeAction,
    selectedOrderIds = [],
    onSelectedOrderIdsChangeAction,
    hideTerminalStatuses = false,
}: Props) {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [orderDetailLoading, setOrderDetailLoading] = useState(false);
    const [terminalConfirm, setTerminalConfirm] = useState<{
        orderId: number;
        nextStatus: string;
        kind: "done" | "cancelled" | "restore";
    } | null>(null);
    const [addressTooltip, setAddressTooltip] = useState<AddressTooltipState>(null);
    const [itemsTooltip, setItemsTooltip] = useState<ItemsTooltipState>(null);
    const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isStatusPending, startStatusTransition] = useTransition();
    const [productsColWidth, setProductsColWidth] = useState<number | null>(null);
    const productsThRef = useRef<HTMLTableCellElement | null>(null);
    const { options: statusOptions } = useOrderStatusOptions(true);

    const statusOptionsForOrder = useCallback(
        (order: OrderData): OrderStatusOption[] => {
            if (statusOptions.some((item) => item.value === order.status)) {
                return statusOptions;
            }
            return [
                ...statusOptions,
                {
                    value: order.status,
                    label: getOrderStatusLabel(order.status, order.status_label),
                    color: getOrderStatusColor(order.status, order.status_color),
                },
            ];
        },
        [statusOptions],
    );

    const onProductsColResizeStart = useCallback((event: ReactMouseEvent<HTMLSpanElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const measured = Math.round(productsThRef.current?.getBoundingClientRect().width ?? 168);
        const startX = event.clientX;
        const startWidth = measured;

        const onMove = (moveEvent: MouseEvent) => {
            const next = Math.min(
                PRODUCTS_COL_MAX_PX,
                Math.max(PRODUCTS_COL_MIN_PX, startWidth + (moveEvent.clientX - startX)),
            );
            setProductsColWidth(next);
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

    const todayIso = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

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
                const nextStatus = (response.data.status ?? status).trim();
                const shouldHide =
                    hideTerminalStatuses && DEFAULT_LIST_HIDDEN_STATUSES.has(nextStatus);

                setOrders((prev) =>
                    shouldHide
                        ? prev.filter((order) => order.id !== orderId)
                        : prev.map((order) =>
                              order.id === orderId ? { ...order, ...response.data } : order,
                          ),
                );

                setSelectedOrder((prev) => {
                    if (!prev || prev.id !== orderId) {
                        return prev;
                    }
                    return shouldHide ? null : { ...prev, ...response.data };
                });

                if (shouldHide && selectedOrderIds.includes(orderId)) {
                    onSelectedOrderIdsChangeAction?.(
                        selectedOrderIds.filter((id) => id !== orderId),
                    );
                }

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
        if (COMPLETED_STATUSES.has(currentStatus)) {
            return;
        }
        if (nextStatus === "done" || nextStatus === "completed") {
            setTerminalConfirm({
                orderId,
                nextStatus,
                kind: "done",
            });
            return;
        }
        if (nextStatus === "cancelled") {
            setTerminalConfirm({
                orderId,
                nextStatus,
                kind: "cancelled",
            });
            return;
        }
        if (currentStatus === "cancelled") {
            setTerminalConfirm({
                orderId,
                nextStatus,
                kind: "restore",
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
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-admin-surface shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
                <div
                    className={
                        productsColWidth === null
                            ? "overflow-x-auto lg:overflow-x-hidden"
                            : "overflow-x-auto"
                    }
                >
                <table className="w-full min-w-0 border-collapse text-[13px] font-medium table-fixed">
                    <colgroup>
                        <col style={{ width: "2.25rem" }} />
                        <col style={{ width: "7.5rem" }} />
                        <col style={{ width: "5.75rem" }} />
                        <col style={{ width: "7rem" }} />
                        <col style={{ width: "15ch" }} />
                        <col style={{ width: "3.5rem" }} />
                        <col style={{ width: "6.75rem" }} />
                        <col style={{ width: "9rem" }} />
                        <col
                            className={
                                productsColWidth === null
                                    ? "w-11 lg:w-auto"
                                    : undefined
                            }
                            style={
                                productsColWidth === null
                                    ? undefined
                                    : {
                                          width: `${productsColWidth}px`,
                                          minWidth: `${productsColWidth}px`,
                                      }
                            }
                        />
                        <col style={{ width: "5.75rem" }} />
                        <col style={{ width: "8rem" }} />
                    </colgroup>
                    <thead className="bg-[#F8FAFC]">
                        <tr className="border-b border-black/[0.06] text-left text-[10px] font-bold uppercase tracking-[0.08em] text-admin-text-secondary">
                            <th className="border-r border-black/[0.06] px-2 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleVisibleSelection}
                                    aria-label="Выбрать все заказы на странице"
                                    className={adminCheckbox}
                                />
                            </th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">Заказ</th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">
                                {onDateFilterHeaderClickAction !== undefined ? (
                                    <button
                                        type="button"
                                        onClick={onDateFilterHeaderClickAction}
                                        className="inline-flex cursor-pointer items-center gap-1 border-b border-transparent bg-transparent p-0 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-admin-text-secondary transition hover:scale-[1.04] hover:border-current hover:text-admin-text focus:outline-none"
                                        aria-label="Фильтр по дате отправки"
                                        title="Дата отправки"
                                    >
                                        <span>Дата</span>
                                        <Truck size={12} className="shrink-0" aria-hidden />
                                    </button>
                                ) : (
                                    <span
                                        className="inline-flex items-center gap-1"
                                        title="Дата отправки"
                                    >
                                        <span>Дата</span>
                                        <Truck size={12} className="shrink-0" aria-hidden />
                                    </span>
                                )}
                            </th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">Клиент</th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">Адрес</th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">Время</th>
                            <th className="whitespace-nowrap border-r border-black/[0.06] px-2 py-2.5">ID отправки</th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">
                                {onStatusFilterChangeAction !== undefined ? (
                                    <OrdersStatusFilterHeader
                                        value={statusFilter}
                                        options={statusOptions}
                                        onChangeAction={onStatusFilterChangeAction}
                                    />
                                ) : (
                                    "Статус"
                                )}
                            </th>
                            <th
                                ref={productsThRef}
                                className="relative border-r border-black/[0.06] px-1 py-2.5 text-center lg:px-2 lg:pr-3 lg:text-left"
                            >
                                <span className="lg:hidden">Кол.</span>
                                <span className="hidden lg:inline">Товары</span>
                                <span
                                    role="separator"
                                    aria-orientation="vertical"
                                    aria-label="Изменить ширину колонки товары"
                                    title="Потяните, чтобы изменить ширину. Двойной клик — авто"
                                    onMouseDown={onProductsColResizeStart}
                                    onDoubleClick={() => setProductsColWidth(null)}
                                    className={`absolute inset-y-1 right-0 hidden w-3 cursor-col-resize touch-none items-center justify-center rounded-sm border-r-2 transition lg:flex ${
                                        productsColWidth !== null
                                            ? "border-admin-primary/50 bg-admin-primary/10 text-admin-primary"
                                            : "border-transparent text-admin-text-muted/50 hover:border-admin-primary/40 hover:bg-admin-primary/10 hover:text-admin-primary"
                                    }`}
                                >
                                    <GripVertical size={12} strokeWidth={2.25} aria-hidden className="opacity-80" />
                                </span>
                            </th>
                            <th className="border-r border-black/[0.06] px-2 py-2.5">Сумма</th>
                            <th className="px-2 py-2.5">Теги</th>
                        </tr>
                    </thead>

                    <tbody className="align-middle">
                        {orders.map((order) => {
                            const deliveryOverdue = isOrderDeliveryOverdue(order, todayIso);
                            const statusColor = getOrderStatusColor(order.status, order.status_color);
                            return (
                            <tr
                                key={order.id}
                                className={`border-b border-black/[0.05] transition-colors last:border-b-0 ${
                                    deliveryOverdue
                                        ? "bg-red-50 hover:bg-red-100/80"
                                        : "hover:brightness-[0.98]"
                                }`}
                                style={
                                    deliveryOverdue
                                        ? undefined
                                        : { backgroundColor: orderStatusSoftBg(statusColor) }
                                }
                            >
                                <td className="border-r border-black/[0.05] px-2 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedOrderIdsSet.has(order.id)}
                                        onChange={() => toggleOrderSelection(order.id)}
                                        aria-label={`Выбрать заказ #${order.id}`}
                                        className={adminCheckbox}
                                    />
                                </td>
                                <td className="border-r border-black/[0.05] px-2 py-2">
                                    <div className="flex items-center gap-1">
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
                                <td className="whitespace-nowrap border-r border-black/[0.05] px-2 py-2 tabular-nums text-admin-text">
                                    <AdminOrderDeliveryDateCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
                                        onReloadAction={onOrdersReloadAction}
                                    />
                                </td>
                                <td className="min-w-0 overflow-hidden border-r border-black/[0.05] px-1.5 py-2">
                                    <AdminOrderClientPhoneCell
                                        name={order.customer_name}
                                        phone={order.phone}
                                        searchQuery={searchQuery}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="min-w-0 overflow-hidden border-r border-black/[0.05] px-1.5 py-2">
                                    <AdminOrderAddressCell
                                        city={order.delivery_city}
                                        address={order.delivery_address}
                                        streetPrefix={order.delivery_street_prefix}
                                        house={order.delivery_house}
                                        korpus={order.delivery_korpus}
                                        apartment={order.delivery_apartment}
                                        deliveryDate={order.delivery_date}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="border-r border-black/[0.05] px-2 py-2">
                                    <AdminOrderDeliveryTimeCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
                                    />
                                </td>
                                <td className="border-r border-black/[0.05] px-2 py-2">
                                    <AdminOrderShipmentIdCell
                                        shipmentId={order.shipment_id}
                                        shipmentStatus={order.shipment_status}
                                        deliveryComment={order.delivery_comment}
                                        searchQuery={searchQuery}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="overflow-hidden border-r border-black/[0.05] px-1.5 py-2">
                                    <AdminStatusDropdown
                                        value={order.status}
                                        options={statusOptionsForOrder(order)}
                                        onChangeAction={(nextStatus) =>
                                            requestStatusChange(order.id, order.status, nextStatus)
                                        }
                                        disabled={COMPLETED_STATUSES.has(order.status)}
                                        triggerVariant="text"
                                        triggerColor={statusColor}
                                        menuWidthClassName={STATUS_DROPDOWN_MENU_WIDTH_CLASS}
                                    />
                                </td>
                                <td className="min-w-0 overflow-hidden border-r border-black/[0.05] px-1 py-2 text-center tabular-nums lg:px-2 lg:text-left">
                                    <AdminOrderQtyCell
                                        order={order}
                                        onShowAction={showItemsTooltip}
                                        onHideAction={hideItemsTooltipWithDelay}
                                    />
                                </td>
                                <td className="border-r border-black/[0.05] px-2 py-2 whitespace-nowrap text-right tabular-nums">
                                    {order.total} руб.
                                </td>
                                <td className="px-2 py-2">
                                    <AdminOrderTagsCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
                                    />
                                </td>
                            </tr>
                            );
                        })}
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
                    terminalConfirm?.kind === "done"
                        ? "Перевести заказ в «Выполнен»?"
                        : terminalConfirm?.kind === "cancelled"
                          ? "Перевести заказ в «Отменён»?"
                          : "Вернуть заказ из отменённых?"
                }
                message={
                    terminalConfirm?.kind === "done"
                        ? "Для статуса «Выполнен» будет создано складское списание по резервам, начисление по карте лояльности и выпуск купленных подарочных сертификатов (если применимо). Позже состав заказа изменить будет нельзя."
                        : terminalConfirm?.kind === "cancelled"
                          ? "Для статуса «Отменён» будут сняты резервы на складе и выполнен возврат по подарочным сертификатам заказа (если применимо)."
                          : "Заказ снова станет активным: резервы на складе будут выставлены заново (если применимо). Проверьте наличие товаров и скидочную карту."
                }
                confirmText={
                    terminalConfirm?.kind === "done"
                        ? "Выполнить"
                        : terminalConfirm?.kind === "cancelled"
                          ? "Отменить заказ"
                          : "Вернуть"
                }
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