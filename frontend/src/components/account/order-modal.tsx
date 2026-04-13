"use client";

import { useEffect, useState } from "react";
import { fetchMyOrder } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import {
    getOrderStatusLabel,
    getOrderStatusStyle,
} from "@/constants/order-statuses";

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

        setLoading(true);
        setErrorMessage("");
        setOrder(null);

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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onCloseOrderAction}
        >
            <div
                className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-2xl font-semibold">Заказ #{orderId}</h3>
                        {order && (
                            <div className="mt-2 text-sm text-gray-600">
                                Товаров: {order.items_qty} · Сумма: {order.total} руб.
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseOrderAction}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border text-lg"
                    >
                        ×
                    </button>
                </div>

                {loading && <div className="text-gray-600">Загрузка заказа...</div>}

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

                            <div className="text-sm text-gray-600">
                                Телефон: {order.phone}
                            </div>
                        </div>

                        {order.comment && (
                            <div className="mb-6 rounded-2xl border p-4">
                                <div className="mb-2 text-sm text-gray-500">Комментарий</div>
                                <div>{order.comment}</div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {order.items.map((item) => (
                                <div key={item.id} className="rounded-2xl border p-4">
                                    <div className="text-sm text-gray-500">{item.brand_name}</div>
                                    <div className="text-lg font-medium">{item.product_name}</div>
                                    <div className="text-sm text-gray-600">{item.variant_title}</div>

                                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-700">
                                        <div>SKU: {item.sku || "—"}</div>
                                        <div>Количество: {item.qty}</div>
                                        <div>Цена: {item.price} руб.</div>
                                        <div>Сумма: {item.total} руб.</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 border-t pt-4 text-right">
                            <div className="text-sm text-gray-500">Итого</div>
                            <div className="text-2xl font-semibold">{order.total} руб.</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}