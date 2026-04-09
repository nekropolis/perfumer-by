"use client";

import { useEffect, useState } from "react";
import type { OrderData } from "@/types/catalog";
import { updateOrderStatus } from "@/lib/admin-orders-api";
import { ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";

type Props = {
    initialOrders: OrderData[];
    onSuccessMessage?: (message: string) => void;
    onErrorMessage?: (message: string) => void;
};

export default function AdminOrdersTable({
                                             initialOrders,
                                             onSuccessMessage,
                                             onErrorMessage,
                                         }: Props) {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [savingOrderId, setSavingOrderId] = useState<number | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    const handleStatusChange = async (orderId: number, status: string) => {
        try {
            setSavingOrderId(orderId);
            onErrorMessage?.("");
            onSuccessMessage?.("");

            const response = await updateOrderStatus(orderId, status);

            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, status: response.data.status } : order
                )
            );

            setSelectedOrder((prev) =>
                prev && prev.id === orderId ? { ...prev, status: response.data.status } : prev
            );

            onSuccessMessage?.("Статус заказа обновлён");
        } catch (error) {
            console.error(error);
            onErrorMessage?.("Не удалось обновить статус");
        } finally {
            setSavingOrderId(null);
        }
    };

    return (
        <>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                    <tr className="border-b text-left text-gray-500">
                        <th className="px-4 py-4">Заказ</th>
                        <th className="px-4 py-4">Клиент</th>
                        <th className="px-4 py-4">Телефон</th>
                        <th className="px-4 py-4">Статус</th>
                        <th className="px-4 py-4">Товаров</th>
                        <th className="px-4 py-4">Сумма</th>
                        <th className="px-4 py-4">Действия</th>
                    </tr>
                    </thead>

                    <tbody className="align-middle">
                    {orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-b-0">
                            <td className="px-4 py-4 font-medium">#{order.id}</td>
                            <td className="px-4 py-4">{order.customer_name || "—"}</td>
                            <td className="px-4 py-4">{order.phone}</td>
                            <td className="px-4 py-4">
                                <select
                                    value={order.status}
                                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                    disabled={savingOrderId === order.id}
                                    className="min-w-[180px] rounded-xl border px-3 py-2 text-sm focus:outline-none"
                                >
                                    {ORDER_STATUS_OPTIONS.map((item) => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            <td className="px-4 py-4">{order.items_qty}</td>
                            <td className="px-4 py-4 whitespace-nowrap">{order.total} руб.</td>
                            <td className="px-4 py-4">
                                <button
                                    type="button"
                                    onClick={() => setSelectedOrder(order)}
                                    className="rounded-xl border px-3 py-2 text-sm transition hover:bg-gray-50"
                                >
                                    Состав
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            <AdminOrderItemsModal
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
            />
        </>
    );
}