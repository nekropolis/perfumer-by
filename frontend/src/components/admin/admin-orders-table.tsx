"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MessageSquare, Pencil, ChevronDown, Check, Truck } from "lucide-react";
import { isVeterInTransitStatus, veterOrderUrl } from "@/constants/veter";
import type { ReactNode } from "react";
import type { OrderData, OrderItem } from "@/types/orders";
import { fetchOrder, updateOrderAdminFields, updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusLabel, getOrderStatusTableTextClass, ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminDeliveryTimeInput, {
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
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type Props = {
    initialOrders: OrderData[];
    searchQuery?: string;
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
    /** Открыть попап фильтра по дате доставки (из заголовка колонки). */
    onDateFilterHeaderClickAction?: () => void;
    statusFilter?: string;
    onStatusFilterChangeAction?: (status: string) => void;
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

type StatusFilterMenuCoords = {
    top?: number;
    bottom?: number;
    left: number;
    width: number;
};

function OrdersStatusFilterHeader({
    value,
    onChangeAction,
}: {
    value: string;
    onChangeAction: (status: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuCoords, setMenuCoords] = useState<StatusFilterMenuCoords | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const hasFilter = value.trim() !== "";
    const label = hasFilter ? getOrderStatusLabel(value) : "Статус";

    const updateMenuPosition = () => {
        if (!triggerRef.current) {
            return;
        }
        const rect = triggerRef.current.getBoundingClientRect();
        const menuWidth = Math.min(200, Math.max(0, window.innerWidth - 24));
        const menuHeight = Math.min(320, (ORDER_STATUS_OPTIONS.length + 1) * 36 + 12);
        const pad = 8;
        const gap = 6;
        let left = rect.left;
        if (window.innerWidth - rect.left < menuWidth + pad) {
            left = rect.right - menuWidth;
        }
        left = Math.min(Math.max(pad, left), window.innerWidth - menuWidth - pad);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight + pad && rect.top > spaceBelow;
        setMenuCoords({
            top: openUp ? undefined : rect.bottom + gap,
            bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
            left,
            width: menuWidth,
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) {
            setMenuCoords(null);
            return;
        }
        updateMenuPosition();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
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
        const onReposition = () => updateMenuPosition();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown, { passive: true });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onReposition);
        window.addEventListener("scroll", onReposition, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", onReposition);
            window.removeEventListener("scroll", onReposition, true);
        };
    }, [isOpen]);

    const menu =
        isOpen && menuCoords && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={menuRef}
                      className="fixed z-[9999] max-h-[min(20rem,70vh)] overflow-y-auto rounded-lg border border-admin-border bg-admin-surface p-1 shadow-lg"
                      style={{
                          top: menuCoords.top,
                          bottom: menuCoords.bottom,
                          left: menuCoords.left,
                          width: menuCoords.width,
                      }}
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
                      {ORDER_STATUS_OPTIONS.map((option) => {
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
                className={`inline-flex max-w-full cursor-pointer items-center gap-0.5 bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-wide transition hover:scale-[1.04] hover:text-admin-text hover:underline hover:underline-offset-2 focus:outline-none ${
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
    const callHref = phoneText !== "—" ? telHref(phoneText) : "";
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
            className="leading-tight whitespace-nowrap lg:min-w-0 lg:whitespace-normal"
            tabIndex={hasContent ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            {callHref ? (
                <a
                    href={callHref}
                    className="block font-semibold text-admin-text underline-offset-2 hover:underline lg:truncate lg:pointer-events-none lg:no-underline"
                    data-truncate-check
                    onClick={(event) => event.stopPropagation()}
                >
                    {highlightQueryInText(phoneText, searchQuery)}
                </a>
            ) : (
                <div className="font-semibold text-admin-text lg:truncate" data-truncate-check>
                    {highlightQueryInText(phoneText, searchQuery)}
                </div>
            )}
            <div className="text-[10px] text-admin-text-secondary lg:truncate" data-truncate-check>
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
    streetPrefix,
    house,
    korpus,
    apartment,
    onShowAction,
    onHideAction,
}: {
    city?: string | null;
    address?: string | null;
    streetPrefix?: string | null;
    house?: string | null;
    korpus?: string | null;
    apartment?: string | null;
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
            className="leading-tight whitespace-nowrap lg:min-w-0 lg:whitespace-normal"
            tabIndex={hasAddress ? 0 : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={onHideAction}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={onHideAction}
        >
            <div className="font-medium text-admin-text lg:truncate" data-truncate-check>
                {cityLine}
            </div>
            <div className="text-[10px] text-admin-text-secondary lg:truncate" data-truncate-check>
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
}: {
    order: OrderData;
    onSavedAction: (order: OrderData) => void;
    onErrorAction?: (message: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(order.delivery_date?.trim() || "");
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        setDraft(order.delivery_date?.trim() || format(new Date(), "yyyy-MM-dd"));
        setOpen(true);
    };

    const save = async () => {
        const next = draft.trim();
        if (!next) {
            onErrorAction?.("Укажите дату доставки");
            return;
        }
        setSaving(true);
        try {
            const res = await updateOrderAdminFields(order.id, {
                delivery_date: next,
            });
            onSavedAction(res.data);
            setOpen(false);
        } catch (error) {
            console.error(error);
            onErrorAction?.("Не удалось сохранить дату доставки");
        } finally {
            setSaving(false);
        }
    };

    const label = formatOrderDeliveryDate(order.delivery_date);

    return (
        <>
            <button
                type="button"
                onClick={openEditor}
                className="block w-full rounded-lg px-0.5 py-0.5 text-left tabular-nums leading-snug text-admin-text transition hover:bg-admin-muted hover:underline hover:underline-offset-2"
                aria-label={`Дата доставки заказа #${order.id}`}
                title="Изменить дату доставки"
            >
                {label !== "—" ? label : <span className="text-admin-text-secondary">—</span>}
            </button>
            <AdminModalShell
                open={open}
                onCloseAction={() => !saving && setOpen(false)}
                title={`Дата доставки #${order.id}`}
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
                className="block w-full rounded-lg px-0.5 py-0.5 text-left transition hover:bg-admin-muted"
                aria-label={`Теги заказа #${order.id}`}
                title="Изменить теги"
            >
                {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
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
    statusFilter = "",
    onStatusFilterChangeAction,
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
                <div className="overflow-x-auto lg:overflow-x-hidden">
                <table className="w-max min-w-full border-collapse text-[13px] lg:w-full lg:table-fixed">
                    <colgroup>
                        <col className="w-9" />
                        <col className="w-[7.25rem]" />
                        <col className="w-[7.75rem]" />
                        <col className="w-[11.5rem] lg:w-auto" />
                        <col className="w-[16rem] lg:w-auto" />
                        <col className="w-[4.5rem]" />
                        <col className="w-[6.5rem]" />
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
                                        className="cursor-pointer bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary transition hover:scale-[1.04] hover:text-admin-text hover:underline hover:underline-offset-2 focus:outline-none"
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
                            <th className="border-r border-admin-border px-2 py-2">ID отправки</th>
                            <th className="border-r border-admin-border px-2 py-2">
                                {onStatusFilterChangeAction !== undefined ? (
                                    <OrdersStatusFilterHeader
                                        value={statusFilter}
                                        onChangeAction={onStatusFilterChangeAction}
                                    />
                                ) : (
                                    "Статус"
                                )}
                            </th>
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
                                    <AdminOrderDeliveryDateCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
                                    />
                                </td>
                                <td className="whitespace-nowrap border-r border-admin-border/70 px-2 py-2 lg:whitespace-normal">
                                    <AdminOrderClientPhoneCell
                                        name={order.customer_name}
                                        phone={order.phone}
                                        searchQuery={searchQuery}
                                        onShowAction={showAddressTooltip}
                                        onHideAction={hideAddressTooltipWithDelay}
                                    />
                                </td>
                                <td className="whitespace-nowrap border-r border-admin-border/70 px-2 py-2 lg:whitespace-normal">
                                    <AdminOrderAddressCell
                                        city={order.delivery_city}
                                        address={order.delivery_address}
                                        streetPrefix={order.delivery_street_prefix}
                                        house={order.delivery_house}
                                        korpus={order.delivery_korpus}
                                        apartment={order.delivery_apartment}
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
                                    <AdminOrderShipmentIdCell
                                        shipmentId={order.shipment_id}
                                        shipmentStatus={order.shipment_status}
                                        deliveryComment={order.delivery_comment}
                                        searchQuery={searchQuery}
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
                                    <AdminOrderTagsCell
                                        order={order}
                                        onSavedAction={patchOrderInList}
                                        onErrorAction={onErrorMessageAction}
                                    />
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