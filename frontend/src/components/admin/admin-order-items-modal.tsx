"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { OrderData } from "@/types/orders";
import AdminOrderItemsTable from "@/components/admin/admin-order-items-table";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";

type Props = {
    order: OrderData | null;
    onCloseAction: () => void;
};

function InfoItem({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="min-w-0">
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {label}
            </div>
            <div className="break-words whitespace-normal text-[13px] font-medium text-gray-900" title={value}>
                {value}
            </div>
        </div>
    );
}

export default function AdminOrderItemsModal({ order, onCloseAction }: Props) {
    useEffect(() => {
        if (!order) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [order]);

    if (!order || typeof document === "undefined") {
        return null;
    }

    const hasGiftPayment =
        (order.gift_certificates?.length ?? 0) > 0 ||
        Boolean(order.gift_certificate_code || order.gift_certificate_number);

    const hasDiscountCard =
        Boolean(order.discount_card_number) ||
        Number(order.discount_amount ?? "0") > 0 ||
        Number(order.discount_percent_snapshot ?? "0") > 0;

    const hasGiftPurchases = (order.gift_certificate_purchases?.length ?? 0) > 0;
    const hasSoldGiftCerts = (order.sold_gift_certificates?.length ?? 0) > 0;

    const giftLine = order.gift_certificates?.[0];

    const giftCode =
        giftLine?.code ||
        order.gift_certificate_code ||
        order.gift_certificate_number ||
        "—";

    const giftNominal = giftLine?.nominal_amount ?? null;
    const giftApplied = giftLine?.amount_applied ?? order.gift_certificate_amount ?? "0.00";
    const giftBalance = giftLine?.balance_amount ?? null;

    const deliveryAddress = order.delivery_address || order.delivery_city || "—";
    const deliveryMethod = order.delivery_method_label || order.delivery_method || "—";
    const paymentMethod = order.payment_method_label || order.payment_method || "—";
    const deliveryCity = order.delivery_city || "—";

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

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="

                flex h-[94dvh] w-[calc(100vw-24px)] max-w-[1024px] flex-col overflow-hidden
        
                rounded-3xl bg-white shadow-2xl
        
                sm:h-[min(90vh,920px)]
        
            "
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-order-items-title"
            >
                <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3
                                id="admin-order-items-title"
                                className="truncate text-xl font-semibold leading-tight text-gray-950 sm:text-2xl"
                            >
                                Заказ #{order.id} - {formatDate(order.created_at)}
                            </h3>

                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
                                <span className="rounded-full bg-gray-100 px-2 py-0.5">
                                    Товаров: {order.items_qty}
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5">
                                    Сумма: {order.subtotal} руб.
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="
                                inline-flex h-9 w-9 shrink-0 items-center justify-center
                                rounded-xl border border-gray-200 bg-white text-xl leading-none
                                text-gray-500 transition hover:bg-gray-50 hover:text-gray-900
                            "
                            aria-label="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                    <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Клиент
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <InfoItem label="Клиент" value={order.customer_name ? order.customer_name : "Не указан"} />
                                <InfoItem label="Телефон" value={order.phone || "—"} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Доставка и оплата
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2">
                                    <InfoItem
                                        label="Адрес"
                                        value={deliveryCity + ", " + deliveryAddress}
                                    />
                                </div>

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

                        <div
                            className={`rounded-2xl border p-3 ${hasGiftPayment
                                ? "border-amber-200 bg-amber-50"
                                : "border-gray-100 bg-gray-50/70"
                                }`}
                        >
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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
                                <div className="text-[13px] text-gray-500">
                                    Не применялся
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Скидочная карта
                            </div>

                            {hasDiscountCard ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <InfoItem
                                        label="Номер карты"
                                        value={order.discount_card_number || "—"}
                                    />
                                    <InfoItem
                                        label="% скидки"
                                        value={`${order.discount_percent_snapshot ?? "0.00"}%`}
                                    />
                                    <InfoItem
                                        label="Сумма скидки"
                                        value={`${order.discount_amount ?? "0.00"} руб.`}
                                    />
                                </div>
                            ) : (
                                <div className="text-[13px] text-gray-500">
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
                                        <div className="mb-1 text-xs font-medium text-gray-700">
                                            Выпущенные сертификаты (запись в каталоге)
                                        </div>
                                        <ul className="space-y-2 text-sm">
                                            {order.sold_gift_certificates!.map((row) => (
                                                <Fragment key={row.id}>
                                                    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-2 py-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="font-mono text-xs text-gray-500">ID {row.id}</div>
                                                            <div className="truncate font-medium text-gray-900">
                                                                {row.template_title ?? "Сертификат"}
                                                            </div>
                                                            <div className="text-xs text-gray-600">
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
                                                        <p className="mt-2 text-xs text-gray-600">
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

                    <div className="overflow-x-auto rounded-2xl border border-gray-100">
                        <AdminOrderItemsTable
                            items={order.items}
                            certificatePurchases={order.gift_certificate_purchases}
                        />
                    </div>

                    <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-white">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Итого:</span>
                            <span className="text-xl font-semibold">
                                {order.total} руб.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div >,
        document.body
    );
}