"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { OrderData } from "@/types/orders";
import AdminOrderItemsTable from "@/components/admin/admin-order-items-table";

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
            <div className="truncate text-[13px] font-medium text-gray-900" title={value}>
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

    const hasGiftCertificate =
        (order.gift_certificates?.length ?? 0) > 0 ||
        Boolean(order.gift_certificate_code || order.gift_certificate_number);

    const hasDiscountCard =
        Boolean(order.discount_card_number) ||
        Number(order.discount_amount ?? "0") > 0 ||
        Number(order.discount_percent_snapshot ?? "0") > 0;

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
                                Заказ #{order.id}
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

                            <div className="grid grid-cols-1 gap-2">
                                <InfoItem label="Клиент" value={order.customer_name || "—"} />
                                <InfoItem label="Телефон" value={order.phone || "—"} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Доставка и оплата
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2">
                                    <InfoItem label="Адрес" value={deliveryAddress} />
                                </div>

                                <InfoItem label="Доставка" value={deliveryMethod} />
                                <InfoItem label="Оплата" value={paymentMethod} />
                                <InfoItem
                                    label="Стоимость"
                                    value={`${order.delivery_fee ?? "0.00"} руб.`}
                                />
                            </div>
                        </div>

                        <div
                            className={`rounded-2xl border p-3 ${
                                hasGiftCertificate
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-gray-100 bg-gray-50/70"
                            }`}
                        >
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Сертификат
                            </div>

                            {hasGiftCertificate ? (
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

                        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white md:col-span-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Итог к оплате
                            </div>

                            <div className="mt-1 flex items-end gap-1">
                                <div className="truncate text-2xl font-semibold leading-none sm:text-3xl">
                                    {order.total}
                                </div>
                                <div className="pb-0.5 text-sm text-slate-400">руб.</div>
                            </div>
                        </div>
                    </div>

                    <div className="min-h-[260px] overflow-x-auto rounded-2xl border border-gray-100">
                        <AdminOrderItemsTable items={order.items} />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}