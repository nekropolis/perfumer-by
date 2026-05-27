"use client";

import Image from "next/image";
import { useEffect, useState, startTransition } from "react";
import { fetchMyOrder } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import {
    getOrderStatusLabel,
    getOrderStatusStyle,
} from "@/constants/order-statuses";
import OrderDiscountSummary from "@/components/account/order-discount-summary";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { formatMoneyRub } from "@/lib/format-money-display";

type Props = {
    orderId: number | null;
    onCloseOrderAction: () => void;
};

export default function OrderModal({ orderId, onCloseOrderAction }: Props) {
    const [order, setOrder] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!orderId) return;

        startTransition(() => {
            setLoading(true);
            setErrorMessage("");
            setOrder(null);
        });

        fetchMyOrder(orderId)
            .then((response) => {
                setOrder(response.data);
            })
            .catch((error) => {
                console.error(error);
                setErrorMessage("Не удалось загрузить заказ");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [orderId]);

    useEffect(() => {
        if (!orderId) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCloseOrderAction();
            }
        };

        document.addEventListener("keydown", handleEsc);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleEsc);
            document.body.style.overflow = "";
        };
    }, [orderId, onCloseOrderAction]);

    if (!orderId) return null;

    return (
        <div
            className="fixed inset-0 z-[250] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseOrderAction}
        >
            <div
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-4">
                    <div className="text-[var(--text-secondary)]">
                        Заказ #{orderId}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseOrderAction}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--background)] text-xl"
                    >
                        ×
                    </button>
                </div>

                <div className="rounded-3xl bg-[var(--background)] p-6 text-center text-[var(--text-secondary)]">
                    {loading && <div className="text-[var(--text-secondary)]">Загрузка заказа...</div>}

                    {!loading && errorMessage && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    {!loading && order && (
                        <div>
                            <div className="mb-6 flex flex-wrap items-center gap-3">
                                <span> Статус заказа: </span>
                                <div
                                    className={`rounded-full px-3 py-1 text-sm ${getOrderStatusStyle(order.status)}`}
                                >
                                   {getOrderStatusLabel(order.status)}
                                </div>
                            </div>

                            {order.comment && (
                                <div
                                    className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4">
                                    <div className="mb-2 text-sm text-[var(--text-secondary)]">Комментарий</div>
                                    <div>{order.comment}</div>
                                </div>
                            )}

                            <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left">
                                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                    <div>
                                        <dt className="text-[var(--text-secondary)]">Тип</dt>
                                        <dd className="mt-0.5 font-medium text-[var(--foreground)]">
                                            {order.delivery_method_label?.trim() ||
                                                order.delivery_method?.trim() ||
                                                "—"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[var(--text-secondary)]">Стоимость доставки</dt>
                                        <dd className="mt-0.5 font-medium text-[var(--foreground)]">
                                            {formatMoneyRub(order.delivery_fee ?? "0")}
                                        </dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <dt className="text-[var(--text-secondary)]">Адрес</dt>
                                        <dd className="mt-0.5 font-medium text-[var(--foreground)]">
                                            {[
                                                order.delivery_city?.trim(),
                                                order.delivery_address?.trim(),
                                            ]
                                                .filter(Boolean)
                                                .join(", ") || "—"}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            <div className="space-y-4">
                                {order.items.map((item) => {
                                    const productTitle = lineItemProductTitle(item);
                                    return (
                                    <div
                                        key={item.id}
                                        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4"
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex min-w-0 items-start gap-3">
                                                {item.image ? (
                                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--background)] sm:h-14 sm:w-14">
                                                        <Image
                                                            src={normalizeProductImageUrl(item.image)}
                                                            loader={productImageLoader}
                                                            alt={productTitle}
                                                            fill
                                                            sizes="56px"
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[10px] font-semibold text-[var(--text-secondary)] sm:h-14 sm:w-14 sm:text-xs">
                                                        Товар
                                                    </div>
                                                )}

                                                <div className="min-w-0 flex-1 text-left">
                                                    <div className="break-words text-sm font-medium leading-snug text-[var(--foreground)] sm:text-base">
                                                        {productTitle}
                                                        {item.variant_title && (
                                                            <span className="text-[var(--text-secondary)]">
                                                                {" "}— {item.variant_title}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="mt-1 flex flex-col gap-0.5 text-xs leading-relaxed text-[var(--text-secondary)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:text-sm">
                                                        <span>Код товара: {item.sku || item.id}</span>
                                                        <span>Цена: {formatMoneyRub(item.price)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between rounded-xl bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] sm:block sm:bg-transparent sm:p-0 sm:text-right">
                                                <div>Кол-во: {item.qty}</div>
                                                <div className="sm:mt-1">Сумма: {formatMoneyRub(item.total)}</div>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
                                {order.gift_certificate_purchases?.map((row) => (
                                    <div
                                        key={row.id}
                                        className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4"
                                    >
                                        <div className="mt-1 text-lg font-medium">
                                            Подарочный сертификат: {row.template_title}
                                        </div>
                                        <div className="mt-2 text-sm text-[var(--text-secondary)]">
                                            Номинал {formatMoneyRub(row.amount)} × {row.qty} шт. — {formatMoneyRub(row.total)}
                                        </div>
                                        <div className="mt-2 text-xs text-[var(--text-secondary)]">
                                            Остаток по сертификату уточняйте у менеджера.
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <OrderDiscountSummary order={order}/>

                            <div className="mt-6 border-t border-[var(--line)] pt-4 text-right">
                                <div className="text-sm text-[var(--text-secondary)]">К оплате</div>
                                <div className="text-2xl font-semibold">{formatMoneyRub(order.total)}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
