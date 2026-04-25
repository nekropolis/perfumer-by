"use client";

import { useEffect, useState, startTransition } from "react";
import { fetchMyOrder } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import {
    getOrderStatusLabel,
    getOrderStatusStyle,
} from "@/constants/order-statuses";
import OrderDiscountSummary from "@/components/account/order-discount-summary";

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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseOrderAction}
        >
            <div
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <div className="text-sm uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                            Order details
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold font-display">
                            Заказ #{orderId}
                        </h3>
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
                                <div
                                    className={`rounded-full px-3 py-1 text-sm ${getOrderStatusStyle(order.status)}`}
                                >
                                    {getOrderStatusLabel(order.status)}
                                </div>

                                <div className="text-sm text-[var(--text-secondary)]">
                                    Телефон: {order.phone}
                                </div>
                            </div>

                            {order.comment && (
                                <div
                                    className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4">
                                    <div className="mb-2 text-sm text-[var(--text-secondary)]">Комментарий</div>
                                    <div>{order.comment}</div>
                                </div>
                            )}

                            <OrderDiscountSummary order={order}/>

                            <div className="space-y-4">
                                {order.items.map((item) => (
                                    <div key={item.id}
                                         className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                                        <div className="text-sm text-[var(--text-secondary)]">{item.brand_name}</div>
                                        <div className="text-lg font-medium">{item.product_name}</div>
                                        <div className="text-sm text-[var(--text-secondary)]">{item.variant_title}</div>

                                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--foreground)]">
                                            <div>SKU: {item.sku || "—"}</div>
                                            <div>Количество: {item.qty}</div>
                                            <div>Цена: {item.price} руб.</div>
                                            <div>Сумма: {item.total} руб.</div>
                                        </div>
                                    </div>
                                ))}
                                {order.gift_certificate_purchases?.map((row) => (
                                    <div
                                        key={row.id}
                                        className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4"
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">
                                            Подарочный сертификат
                                        </div>
                                        <div className="mt-1 text-lg font-medium">{row.template_title}</div>
                                        <div className="mt-2 text-sm text-[var(--text-secondary)]">
                                            Номинал {row.amount} руб. × {row.qty} шт. — {row.total} руб.
                                        </div>
                                    </div>
                                ))}
                                {order.sold_gift_certificates?.map((row) => (
                                    <div
                                        key={row.id}
                                        className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-4"
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                                            Подарочный сертификат
                                        </div>
                                        <div className="mt-1 text-lg font-medium">
                                            {row.template_title ?? "Сертификат"} · {row.initial_amount} руб.
                                        </div>
                                        {row.code ? (
                                            <div className="mt-2 font-mono text-sm">Код: {row.code}</div>
                                        ) : (
                                            <div className="mt-2 text-sm text-[var(--text-secondary)]">
                                                Код сообщат после выполнения заказа (номер наносится на сертификат в
                                                магазине).
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 border-t border-[var(--line)] pt-4 text-right">
                                <div className="text-sm text-[var(--text-secondary)]">К оплате</div>
                                <div className="text-2xl font-semibold">{order.total} руб.</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
