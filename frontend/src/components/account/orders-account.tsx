"use client";

import {getOrderStatusLabel, getOrderStatusStyle} from "@/constants/order-statuses";
import {useEffect, useState} from "react";
import {fetchMyOrders} from "@/lib/my-orders-api";
import type {OrderData} from "@/types/orders";
import OrderModal from "@/components/account/order-modal";

type OrdersAccountProps = {
    isAuthenticated: boolean;
};

export default function OrdersAccount({ isAuthenticated }: OrdersAccountProps) {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

    useEffect(() => {
        if (!isAuthenticated) {
            setOrders([]);
            setOrdersLoading(false);
            return;
        }

        fetchMyOrders()
            .then((response) => {
                setOrders(response.data);
            })
            .catch((error) => {
                console.error(error);
                setErrorMessage("Не удалось загрузить заказы");
            })
            .finally(() => {
                setOrdersLoading(false);
            });
    }, [isAuthenticated]);

    return (
        <>
            <section className="rounded-2xl border p-5">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold">Мои заказы</h2>
                </div>

                {ordersLoading && (
                    <div className="text-gray-600">Загрузка заказов...</div>
                )}

                {!ordersLoading && errorMessage && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorMessage}
                    </div>
                )}

                {!ordersLoading && !errorMessage && orders.length === 0 && (
                    <div className="rounded-xl border border-dashed px-4 py-6 text-gray-600">
                        У вас пока нет заказов.
                    </div>
                )}

                {!ordersLoading && !errorMessage && orders.length > 0 && (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <div key={order.id} className="rounded-2xl border p-5">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-lg font-medium">Заказ #{order.id}</div>

                                    <div
                                        className={`rounded-full px-3 py-1 text-sm ${getOrderStatusStyle(order.status)}`}
                                    >
                                        {getOrderStatusLabel(order.status)}
                                    </div>
                                </div>

                                <div className="mb-4 text-sm text-gray-600">
                                    Товаров: {order.items_qty} · Сумма: {order.total} руб.
                                </div>

                                <div className="space-y-2">
                                    {order.items.slice(0, 2).map((item) => (
                                        <div key={item.id} className="text-sm text-gray-700">
                                            <span className="font-medium">{item.product_name}</span>{" "}
                                            — {item.variant_title} · {item.qty} × {item.price} руб.
                                        </div>
                                    ))}

                                    {order.items.length > 2 && (
                                        <div className="text-sm text-gray-500">
                                            И ещё {order.items.length - 2} поз.
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedOrderId(order.id)}
                                    className="mt-4 inline-block text-sm underline"
                                >
                                    Подробнее
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <OrderModal
                orderId={selectedOrderId}
                onCloseOrderAction={() => setSelectedOrderId(null)}
            />
        </>
    )
}