"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import type { OrderData } from "@/types/orders";
import AdminOrderItemsTable from "@/components/admin/admin-order-items-table";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";
import { formatDeliveryClockTime } from "@/components/admin/orders/admin-delivery-time-input";
import {
    fetchAdminOrderCustomerContext,
    type AdminOrderCustomerContext,
    type AdminOrderCustomerContextOrderRow,
} from "@/lib/admin-orders-api";

type Props = {
    order: OrderData | null;
    /** Полная загрузка заказа GET /admin/orders/:id (надёжнее, чем строка из списка). */
    orderDetailLoading?: boolean;
    onCloseAction: () => void;
};

type OrdersHistoryModalKind = "completed" | "active" | "cancelled";

const ORDERS_HISTORY_MODAL_TITLES: Record<OrdersHistoryModalKind, string> = {
    completed: "Выполненные заказы по номеру",
    active: "Активные заказы по номеру",
    cancelled: "Отменённые заказы по номеру",
};

function ordersForHistoryModal(
    context: AdminOrderCustomerContext,
    kind: OrdersHistoryModalKind,
): AdminOrderCustomerContextOrderRow[] {
    if (kind === "completed") return context.completed_orders;
    if (kind === "active") return context.active_orders ?? [];
    return context.cancelled_orders ?? [];
}

function formatContextDateTime(value: string | null): string {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("ru-RU");
}

function parseMoney(value: unknown): number {
    if (value == null || value === "") {
        return 0;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    let s = String(value).trim();
    s = s.replace(/\u00a0/g, "").replace(/\s/g, "");
    s = s.replace(",", ".");
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

function snakeToCamel(key: string): string {
    return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function orderPick(order: OrderData, snakeKey: string): unknown {
    const r = order as unknown as Record<string, unknown>;
    return r[snakeKey] ?? r[snakeToCamel(snakeKey)];
}

function orderMoney(order: OrderData, snakeKey: string): number {
    return parseMoney(orderPick(order, snakeKey));
}

/** Как в OrderResource::resolveDiscountAmount: субтотал + доставка − списание сертификатом − итого. */
function impliedLoyaltyDiscountFromTotals(order: OrderData): number {
    const sub = orderMoney(order, "subtotal");
    const del = orderMoney(order, "delivery_fee");
    const gift = orderMoney(order, "gift_certificate_amount");
    const tot = orderMoney(order, "total");
    return Math.max(0, Math.round((sub + del - gift - tot) * 100) / 100);
}

function formatRub(n: number): string {
    return n.toFixed(2);
}

function parseDiscountCardId(order: OrderData): number | null {
    const v = orderPick(order, "discount_card_id");
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        return v;
    }
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
        return Number.parseInt(v, 10);
    }
    return null;
}

function discountCardNumberFromOrder(order: OrderData): string {
    const v = orderPick(order, "discount_card_number");
    const s = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
    return s;
}

function InfoItem({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="min-w-0">
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                {label}
            </div>
            <div className="break-words whitespace-normal text-[13px] font-medium text-admin-text" title={value}>
                {value}
            </div>
        </div>
    );
}

function formatDeliveryDate(value?: string | null): string {
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

function formatDeliveryTimeRange(from?: string | null, to?: string | null): string {
    const a = formatDeliveryClockTime(from);
    const b = formatDeliveryClockTime(to);
    if (!a && !b) {
        return "—";
    }
    return `${a || "—"} – ${b || "—"}`;
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

export default function AdminOrderItemsModal({ order, orderDetailLoading, onCloseAction }: Props) {
    const [customerContext, setCustomerContext] = useState<AdminOrderCustomerContext | null>(null);
    const [customerContextLoading, setCustomerContextLoading] = useState(false);
    const [ordersHistoryModal, setOrdersHistoryModal] = useState<OrdersHistoryModalKind | null>(null);

    useEffect(() => {
        if (!order && !orderDetailLoading) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [order, orderDetailLoading]);

    useEffect(() => {
        const phone = order?.phone?.trim() || "";
        if (!phone) {
            setCustomerContext(null);
            setCustomerContextLoading(false);
            return;
        }

        let cancelled = false;
        setCustomerContextLoading(true);
        setCustomerContext(null);
        setOrdersHistoryModal(null);

        void fetchAdminOrderCustomerContext(phone)
            .then((res) => {
                if (!cancelled) {
                    setCustomerContext(res.data);
                }
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setCustomerContext(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setCustomerContextLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [order?.id, order?.phone]);

    if (typeof document === "undefined") {
        return null;
    }

    if (orderDetailLoading && !order) {
        return createPortal(
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/55 p-4"
                onClick={onCloseAction}
                role="presentation"
            >
                <div
                    className="rounded-2xl bg-white px-6 py-5 text-sm text-admin-text shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    role="status"
                >
                    Загрузка заказа…
                </div>
            </div>,
            document.body,
        );
    }

    if (!order) {
        return null;
    }

    const giftCertificateAmt = orderMoney(order, "gift_certificate_amount");

    const hasGiftPayment =
        (order.gift_certificates?.length ?? 0) > 0 ||
        Boolean(orderPick(order, "gift_certificate_code") || orderPick(order, "gift_certificate_number")) ||
        giftCertificateAmt > 0.004;

    const cardDiscountAmt = orderMoney(order, "discount_amount");
    const impliedLoyalty = impliedLoyaltyDiscountFromTotals(order);
    const cardDiscountEffective = Math.max(cardDiscountAmt, impliedLoyalty);
    const cardPercentVal = orderMoney(order, "discount_percent_snapshot");
    const cardId = parseDiscountCardId(order);
    const cardNumber = discountCardNumberFromOrder(order);
    const subtotalN = orderMoney(order, "subtotal");

    const derivedPercentFromTotals =
        subtotalN > 0.004 && cardDiscountEffective > 0.004
            ? Math.round((cardDiscountEffective / subtotalN) * 10000) / 100
            : 0;

    const displayPercent =
        cardPercentVal > 0.004 ? cardPercentVal : cardDiscountEffective > 0.004 ? derivedPercentFromTotals : 0;

    const hasDiscountCard =
        cardId != null ||
        cardNumber !== "" ||
        cardPercentVal > 0.004 ||
        cardDiscountAmt > 0.004 ||
        impliedLoyalty > 0.004;

    const hasGiftPurchases = (order.gift_certificate_purchases?.length ?? 0) > 0;
    const hasSoldGiftCerts = (order.sold_gift_certificates?.length ?? 0) > 0;

    const giftLine = order.gift_certificates?.[0];

    const giftCode =
        giftLine?.code ||
        (orderPick(order, "gift_certificate_code") as string | undefined) ||
        (orderPick(order, "gift_certificate_number") as string | undefined) ||
        "—";

    const giftNominal = giftLine?.nominal_amount ?? null;
    const giftApplied =
        giftLine?.amount_applied ??
        (orderPick(order, "gift_certificate_amount") != null
            ? String(orderPick(order, "gift_certificate_amount"))
            : "0.00");
    const giftBalance = giftLine?.balance_amount ?? null;

    const deliveryAddress = order.delivery_address || order.delivery_city || "—";
    const deliveryMethod = order.delivery_method_label || order.delivery_method || "—";
    const paymentMethod = order.payment_method_label || order.payment_method || "—";
    const deliveryCity = order.delivery_city || "—";
    const deliveryDateLabel = formatDeliveryDate(order.delivery_date);
    const deliveryTimeLabel = formatDeliveryTimeRange(order.delivery_time_from, order.delivery_time_to);
    const managerComment = order.manager_comment?.trim() || "";
    const orderTags = order.tags ?? [];

    const formatDate = (value?: string | null): string => {
        if (!value) {
            return "—";
        }
        try {
            return new Date(value).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return value;
        }
    };

    const mainModal = createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="flex h-[94dvh] w-[calc(100vw-24px)] max-w-[1024px] flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:h-[min(90vh,920px)] sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-order-items-title"
            >
                <div className="border-b border-admin-border px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3
                                id="admin-order-items-title"
                                className="truncate text-xl font-semibold leading-tight text-admin-text sm:text-2xl"
                            >
                                Заказ #{order.id} - {formatDate(order.created_at)}
                            </h3>
                        </div>

                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="
                                inline-flex h-9 w-9 shrink-0 items-center justify-center
                                rounded-lg border border-admin-border bg-white text-xl leading-none
                                text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text
                            "
                            aria-label="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                    <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-2xl border border-admin-border bg-admin-muted/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                                Клиент
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <InfoItem label="Клиент" value={order.customer_name ? order.customer_name : "Не указан"} />
                                <InfoItem label="Телефон" value={order.phone || "—"} />
                            </div>

                            <div className="mt-3 border-t border-admin-border/70 pt-3">
                                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                                    Заказы по телефону
                                </div>
                                {customerContextLoading ? (
                                    <p className="text-[13px] text-admin-text-secondary">Загрузка…</p>
                                ) : customerContext ? (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            {(
                                                [
                                                    {
                                                        kind: "completed" as const,
                                                        label: "Выполнено",
                                                        count: customerContext.orders.completed,
                                                        countClass: "text-emerald-700",
                                                    },
                                                    {
                                                        kind: "active" as const,
                                                        label: "Активные",
                                                        count: customerContext.orders.active,
                                                        countClass: "text-sky-700",
                                                    },
                                                    {
                                                        kind: "cancelled" as const,
                                                        label: "Отменено",
                                                        count: customerContext.orders.cancelled,
                                                        countClass: "text-admin-text",
                                                    },
                                                ] as const
                                            ).map((stat) => {
                                                const clickable = stat.count > 0;
                                                return (
                                                    <button
                                                        key={stat.kind}
                                                        type="button"
                                                        disabled={!clickable}
                                                        onClick={() => setOrdersHistoryModal(stat.kind)}
                                                        title={clickable ? `Показать: ${stat.label}` : undefined}
                                                        className={`inline-flex min-w-[4.75rem] flex-1 flex-col items-start rounded-lg border px-2 py-1.5 text-left transition sm:flex-none ${
                                                            clickable
                                                                ? "cursor-pointer border-admin-border bg-admin-surface shadow-sm hover:border-admin-primary/40 hover:bg-white"
                                                                : "cursor-not-allowed border-transparent bg-transparent opacity-50"
                                                        }`}
                                                    >
                                                        <span className="text-[10px] text-admin-text-secondary">
                                                            {stat.label}
                                                        </span>
                                                        <span className="flex w-full items-center justify-between gap-1">
                                                            <span
                                                                className={`text-lg font-semibold tabular-nums leading-tight ${stat.countClass}`}
                                                            >
                                                                {stat.count}
                                                            </span>
                                                            {clickable ? (
                                                                <ChevronRight
                                                                    size={14}
                                                                    strokeWidth={2}
                                                                    className="shrink-0 text-admin-text-secondary"
                                                                    aria-hidden
                                                                />
                                                            ) : null}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {customerContext.discount_cards.length > 0 ? (
                                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-admin-text-secondary">
                                                <span>Карта</span>
                                                {customerContext.discount_cards.map((card) => (
                                                    <span
                                                        key={card.number}
                                                        className="inline-flex items-center gap-1 rounded-md bg-admin-surface px-1.5 py-0.5 font-mono text-[11px] text-admin-text ring-1 ring-admin-border/80"
                                                    >
                                                        {card.number}
                                                        <span className="font-sans font-semibold text-admin-primary">
                                                            −{card.discount_percent}%
                                                        </span>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <p className="text-[13px] text-admin-text-secondary">Нет данных по номеру</p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-admin-border bg-admin-muted/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                                Доставка и оплата
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2">
                                    <InfoItem
                                        label="Адрес"
                                        value={deliveryCity + ", " + deliveryAddress}
                                    />
                                </div>

                                <InfoItem label="Дата доставки" value={deliveryDateLabel} />
                                <InfoItem label="Время доставки" value={deliveryTimeLabel} />

                                <div className="col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <InfoItem label="Доставка" value={deliveryMethod} />

                                    <InfoItem
                                        label="Стоимость доставки"
                                        value={`${order.delivery_fee ?? "0.00"} руб.`}
                                    />

                                    <InfoItem label="Оплата" value={paymentMethod} />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-admin-border bg-admin-muted/70 p-3 md:col-span-2">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                                Теги и комментарий менеджера
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="min-w-0">
                                    <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                                        Теги
                                    </div>
                                    {orderTags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {orderTags.map((tag) => (
                                                <span
                                                    key={tag.id}
                                                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                                                    style={{
                                                        backgroundColor: tag.color,
                                                        color: tagContrastText(tag.color),
                                                    }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[13px] text-admin-text-secondary">Не заданы</div>
                                    )}
                                </div>
                                <InfoItem
                                    label="Комментарий менеджера"
                                    value={managerComment || "—"}
                                />
                            </div>
                        </div>

                        <div
                            className={`rounded-2xl border p-3 ${hasGiftPayment
                                ? "border-amber-200 bg-amber-50"
                                : "border-admin-border bg-admin-muted/70"
                                }`}
                        >
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                                Оплата сертификатом
                            </div>

                            {hasGiftPayment ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <InfoItem label="Номер" value={giftCode} />
                                    <InfoItem
                                        label="Номинал"
                                        value={giftNominal ? `${giftNominal} руб.` : "—"}
                                    />
                                    <InfoItem label="Списание" value={`${giftApplied} руб.`} />
                                    <InfoItem
                                        label="Остаток"
                                        value={giftBalance ? `${giftBalance} руб.` : "—"}
                                    />
                                </div>
                            ) : (
                                <div className="text-[13px] text-admin-text-secondary">
                                    Не применялся
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-admin-border bg-admin-muted/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
                                Скидочная карта
                            </div>

                            {hasDiscountCard ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <InfoItem
                                        label="Номер карты"
                                        value={
                                            cardNumber ||
                                            (cardId != null ? `карта #${cardId}` : "—")
                                        }
                                    />
                                    <InfoItem
                                        label="% скидки"
                                        value={`${formatRub(displayPercent)}%`}
                                    />
                                    <InfoItem
                                        label="Сумма скидки"
                                        value={`${formatRub(cardDiscountEffective)} руб.`}
                                    />
                                </div>
                            ) : (
                                <div className="text-[13px] text-admin-text-secondary">
                                    Не применялась
                                </div>
                            )}
                        </div>

                        {hasGiftPurchases || hasSoldGiftCerts ? (
                            <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3 md:col-span-2">
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-900">
                                    Подарочные сертификаты по заказу
                                </div>
                                {hasSoldGiftCerts ? (
                                    <div>
                                        <div className="mb-1 text-xs font-medium text-admin-text">
                                            Выпущенные сертификаты (запись в каталоге)
                                        </div>
                                        <ul className="space-y-2 text-sm">
                                            {order.sold_gift_certificates!.map((row) => (
                                                <Fragment key={row.id}>
                                                    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-2 py-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="font-mono text-xs text-admin-text-secondary">ID {row.id}</div>
                                                            <div className="truncate font-medium text-admin-text">
                                                                {row.template_title ?? "Сертификат"}
                                                            </div>
                                                            <div className="text-xs text-admin-text-secondary">
                                                                Номинал {row.initial_amount} руб. ·{" "}
                                                                {giftCertificateStatusLabel(row.status, row.code)}
                                                                {row.code ? ` · код ${row.code}` : ""}
                                                            </div>
                                                        </div>
                                                        <Link
                                                            href={`/admin/loyalty/certificates/${row.id}/edit`}
                                                            className="shrink-0 rounded-lg border border-violet-200 px-2 py-1 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
                                                        >
                                                            {row.code ? "Открыть" : "Добавить код"}
                                                        </Link>
                                                    </li>
                                                    {row.code
                                                        ? ""
                                                        :
                                                        <p className="mt-2 text-xs text-admin-text-secondary">
                                                            Нужно добавить код сертификата — тогда его можно применить в корзине, после активации.
                                                        </p>
                                                    }
                                                </Fragment>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="overflow-x-auto">
                        <AdminOrderItemsTable
                            items={order.items}
                            certificatePurchases={order.gift_certificate_purchases}
                        />
                    </div>

                    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-white">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Итого:</span>
                            <span className="text-xl font-semibold">
                                {order.total} руб.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );

    return (
        <>
            {mainModal}
            {customerContext && ordersHistoryModal
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 p-4"
                          onClick={() => setOrdersHistoryModal(null)}
                          role="presentation"
                      >
                          <div
                              className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-admin-border bg-admin-surface shadow-2xl"
                              onClick={(e) => e.stopPropagation()}
                              role="dialog"
                              aria-modal="true"
                          >
                              <div className="flex items-center justify-between border-b border-admin-border px-4 py-3">
                                  <h3 className="text-sm font-semibold text-admin-text">
                                      {ORDERS_HISTORY_MODAL_TITLES[ordersHistoryModal]}
                                  </h3>
                                  <button
                                      type="button"
                                      onClick={() => setOrdersHistoryModal(null)}
                                      className="rounded-lg border border-admin-border px-2.5 py-1.5 text-xs text-admin-text hover:bg-admin-muted"
                                  >
                                      Закрыть
                                  </button>
                              </div>
                              <div className="max-h-[72vh] overflow-auto p-4">
                                  {ordersForHistoryModal(customerContext, ordersHistoryModal).length === 0 ? (
                                      <p className="text-sm text-admin-text-secondary">Заказы не найдены.</p>
                                  ) : (
                                      <table className="min-w-full text-sm">
                                          <thead>
                                              <tr className="border-b text-left text-admin-text-secondary">
                                                  <th className="px-3 py-2">№ заказа</th>
                                                  <th className="px-3 py-2">Дата</th>
                                                  <th className="px-3 py-2">Что заказано</th>
                                                  <th className="px-3 py-2 text-right">Кол-во</th>
                                                  <th className="px-3 py-2 text-right">Сумма</th>
                                              </tr>
                                          </thead>
                                          <tbody>
                                              {ordersForHistoryModal(customerContext, ordersHistoryModal).map(
                                                  (row) => (
                                                      <tr key={row.id} className="border-b last:border-b-0">
                                                          <td className="px-3 py-2 font-medium text-admin-text">
                                                              <a
                                                                  href={`/admin/orders/${row.id}/edit`}
                                                                  target="_blank"
                                                                  rel="noreferrer noopener"
                                                                  className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
                                                              >
                                                                  #{row.id}
                                                              </a>
                                                          </td>
                                                          <td className="px-3 py-2">
                                                              {formatContextDateTime(row.created_at)}
                                                          </td>
                                                          <td className="px-3 py-2">
                                                              <div className="space-y-1">
                                                                  {(row.items ?? []).length === 0 ? (
                                                                      <span className="text-xs text-admin-text-secondary">
                                                                          —
                                                                      </span>
                                                                  ) : (
                                                                      (row.items ?? []).map((item, idx) => (
                                                                          <div
                                                                              key={`${row.id}-item-${idx}`}
                                                                              className="text-xs text-admin-text"
                                                                          >
                                                                              <span className="font-medium">
                                                                                  {item.product_name || "Товар"}
                                                                              </span>
                                                                              {item.variant_title
                                                                                  ? ` · ${item.variant_title}`
                                                                                  : ""}
                                                                              {item.qty > 0 ? ` × ${item.qty}` : ""}
                                                                          </div>
                                                                      ))
                                                                  )}
                                                              </div>
                                                          </td>
                                                          <td className="px-3 py-2 text-right tabular-nums">
                                                              {row.items_qty}
                                                          </td>
                                                          <td className="px-3 py-2 text-right tabular-nums">
                                                              {row.total}
                                                          </td>
                                                      </tr>
                                                  ),
                                              )}
                                          </tbody>
                                      </table>
                                  )}
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}