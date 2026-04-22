"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import type { OrderData } from "@/types/orders";
import { updateOrderStatus } from "@/lib/admin-orders-api";
import { ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import CopyText from "@/components/ui/copy-text";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";

type Props = {
    initialOrders: OrderData[];
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
};

const STATUS_DROPDOWN_WIDTH_CLASS = "w-[176px]";
const STATUS_DROPDOWN_MENU_WIDTH_CLASS = "w-[220px]";

export default function AdminOrdersTable({
                                             initialOrders,
                                             onSuccessMessageAction,
                                             onErrorMessageAction,
                                         }: Props) {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    const handleStatusChange = async (orderId: number, status: string) => {
        try {
            onErrorMessageAction?.("");
            onSuccessMessageAction?.("");

            const response = await updateOrderStatus(orderId, status);

            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, status: response.data.status } : order
                )
            );

            setSelectedOrder((prev) =>
                prev && prev.id === orderId ? { ...prev, status: response.data.status } : prev
            );

            onSuccessMessageAction?.("Статус заказа обновлён");
        } catch (error) {
            console.error(error);
            onErrorMessageAction?.("Не удалось обновить статус");
        } finally {
        }
    };

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

    return (
        <>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                    <tr className="border-b text-left text-gray-500">
                        <th className="px-4 py-4">Заказ</th>
                        <th className="px-4 py-4">Дата</th>
                        <th className="px-4 py-4">Клиент</th>
                        <th className="px-4 py-4">Телефон</th>
                        <th className="w-[200px] px-4 py-4">Статус</th>
                        <th className="px-4 py-4">Товаров</th>
                        <th className="px-4 py-4">Сумма</th>
                        <th className="px-4 py-4">Действия</th>
                    </tr>
                    </thead>

                    <tbody className="align-middle">
                    {orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-b-0">
                            <td className="px-4 py-4 font-medium">
                                <CopyText
                                    value={String(order.id)}
                                    label={`#${order.id}`}
                                    title="Скопировать номер заказа"
                                />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                                {formatDate(order.created_at)}
                            </td>
                            <td className="px-4 py-4">{order.customer_name || "—"}</td>
                            <td className="px-4 py-4">{order.phone}</td>
                            <td className="px-4 py-4">
                                <AdminStatusDropdown
                                    value={order.status}
                                    options={ORDER_STATUS_OPTIONS}
                                    onChangeAction={(nextStatus) => handleStatusChange(order.id, nextStatus)}
                                    disabled={order.status === "done"}
                                    widthClassName={STATUS_DROPDOWN_WIDTH_CLASS}
                                    menuWidthClassName={STATUS_DROPDOWN_MENU_WIDTH_CLASS}
                                />
                            </td>
                            <td className="px-4 py-4">{order.items_qty}</td>
                            <td className="px-4 py-4 whitespace-nowrap">{order.total} руб.</td>
                            <td className="px-4 py-4">
                                <button
                                    type="button"
                                    onClick={() => setSelectedOrder(order)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                    aria-label={`Состав заказа #${order.id}`}
                                    title="Состав"
                                >
                                    <Eye size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            <AdminOrderItemsModal
                order={selectedOrder}
                onCloseAction={() => setSelectedOrder(null)}
            />
        </>
    );
}