"use client";

import { getOrderStatusLabel, getOrderStatusStyle } from "@/constants/order-statuses";
import { useEffect, useState, startTransition, useCallback } from "react";
import { fetchMyOrders } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import OrderModal from "@/components/account/order-modal";

type OrdersAccountProps = {
    isAuthenticated: boolean;
};

function parseMoney(value: string | undefined | null): number {
    if (!value) return 0;
    const normalized = value.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function OrdersAccount({ isAuthenticated }: OrdersAccountProps) {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(isAuthenticated);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

    const loadOrders = useCallback(
        async (showLoader: boolean) => {
            if (!isAuthenticated) return;

            if (showLoader) {
                startTransition(() => {
                    setOrdersLoading(true);
                    setErrorMessage("");
                });
            }

            try {
                const response = await fetchMyOrders();
                setOrders(response.data);
                setErrorMessage("");
            } catch {
                setErrorMessage("Не удалось загрузить заказы");
            } finally {
                if (showLoader) {
                    setOrdersLoading(false);
                }
            }
        },
        [isAuthenticated],
    );

    useEffect(() => {
        if (!isAuthenticated) return;

        let cancelled = false;
        const safeLoad = async (showLoader: boolean) => {
            if (cancelled) return;
            await loadOrders(showLoader);
        };

        void safeLoad(true);

        const intervalId = window.setInterval(() => {
            void safeLoad(false);
        }, 20000);

        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === "visible") {
                void safeLoad(false);
            }
        };

        window.addEventListener("focus", handleVisibilityOrFocus);
        document.addEventListener("visibilitychange", handleVisibilityOrFocus);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleVisibilityOrFocus);
            document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
        };
    }, [isAuthenticated, loadOrders]);

    useEffect(() => {
        if (isAuthenticated) return;
        setOrders([]);
        setOrdersLoading(false);
        setErrorMessage("");
        setSelectedOrderId(null);
    }, [isAuthenticated]);

    useEffect(() => {
        if (!selectedOrderId) return;

        const exists = orders.some((order) => order.id === selectedOrderId);
        if (!exists) {
            setSelectedOrderId(null);
        }
    }, [orders, selectedOrderId]);

    const totalOrders = orders.length;
    const totalSpent = orders
        .filter((order) => order.status === "done")
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return (
        <>
            <section className="space-y-6">
                <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                    <div className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                        Информация
                    </div>

                    <h2 className="mt-2 text-2xl font-semibold font-display">
                        Мои заказы
                    </h2>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl bg-[var(--background)] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                                Всего заказов
                            </div>
                            <div className="mt-2 text-2xl font-semibold">
                                {totalOrders}
                            </div>
                        </div>

                        <div className="rounded-3xl bg-[var(--background)] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                                Сумма
                            </div>
                            <div className="mt-2 text-2xl font-semibold">
                                {totalSpent.toLocaleString("ru-RU")} BYN
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                    {ordersLoading && (
                        <div className="rounded-3xl bg-[var(--background)] px-5 py-8 text-[var(--text-secondary)]">
                            Загрузка заказов...
                        </div>
                    )}

                    {!ordersLoading && errorMessage && (
                        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    {!ordersLoading && orders.length === 0 && !errorMessage && (
                        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--background)] px-5 py-10 text-center text-[var(--text-secondary)]">
                            У вас пока нет заказов.
                        </div>
                    )}

                    {!ordersLoading && orders.length > 0 && (
                        <div className="space-y-3">
                            {orders.map((order) => (
                                <article
                                    key={order.id}
                                    className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(31,23,34,0.07)]"
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-lg font-semibold">
                                                    Заказ #{order.id}
                                                </h3>

                                                <div
                                                    className={`rounded-full px-3 py-1 text-xs ${getOrderStatusStyle(order.status)}`}
                                                >
                                                    {getOrderStatusLabel(order.status)}
                                                </div>
                                            </div>

                                            <div className="mt-2 text-sm text-[var(--text-secondary)]">
                                                {order.items_qty} товаров ·{" "}
                                                {Number(order.total).toLocaleString("ru-RU")} BYN
                                            </div>
                                            {(() => {
                                                const cardDiscount = parseMoney(order.discount_amount);
                                                const certificateDiscount = parseMoney(order.gift_certificate_amount);
                                                const totalDiscount = cardDiscount + certificateDiscount;
                                                if (totalDiscount <= 0.004) {
                                                    return null;
                                                }

                                                const cardNo = order.discount_card_number?.trim();
                                                const reasonParts: string[] = [];
                                                if (cardDiscount > 0.004) {
                                                    reasonParts.push(
                                                        cardNo
                                                            ? `карта ${cardNo}`
                                                            : "карта лояльности (карта удалена)"
                                                    );
                                                }
                                                if (certificateDiscount > 0.004) {
                                                    reasonParts.push("подарочный сертификат");
                                                }

                                                return (
                                                    <div className="mt-1 text-xs font-medium text-green-700">
                                                        Скидка: −{totalDiscount.toLocaleString("ru-RU", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}{" "}
                                                        BYN
                                                        {reasonParts.length > 0 ? ` · ${reasonParts.join(", ")}` : ""}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedOrderId(order.id)}
                                            className="rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                                        >
                                            Подробнее
                                        </button>
                                    </div>

                                    <div className="mt-5 space-y-2">
                                        {order.items.slice(0, 2).map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--background)] px-4 py-3 text-sm"
                                            >
                                                <div>
                                                    <div className="font-medium">
                                                        {item.product_name}
                                                    </div>

                                                    <div className="text-[var(--text-secondary)]">
                                                        {item.variant_title}
                                                    </div>
                                                </div>

                                                <div className="text-[var(--text-secondary)]">
                                                    {item.qty} × {item.price} BYN
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <OrderModal
                orderId={selectedOrderId}
                onCloseOrderAction={() => setSelectedOrderId(null)}
            />
        </>
    );
}
