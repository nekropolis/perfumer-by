"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { OrderData } from "@/types/orders";
import { fetchOrder, updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusTableTextClass, ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrderItemsModal from "@/components/admin/admin-order-items-modal";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";

type Props = {
    initialOrders: OrderData[];
    searchQuery?: string;
    onSuccessMessageAction?: (message: string) => void;
    onErrorMessageAction?: (message: string) => void;
    /** Подпись фильтра по дате создания (как у кнопки в тулбаре). */
    dateFilterSummary?: string;
    /** Открыть тот же попап фильтра по датам (вызывается с родителя). */
    onDateFilterHeaderClickAction?: () => void;
};

const STATUS_DROPDOWN_MENU_WIDTH_CLASS = "w-[220px]";

const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

function highlightQueryInText(text: string, query: string): ReactNode {
    const q = query.trim();
    if (!q) {
        return text;
    }

    const lowerText = text.toLocaleLowerCase("ru-RU");
    const lowerQ = q.toLocaleLowerCase("ru-RU");
    const parts: ReactNode[] = [];
    let pos = 0;

    for (let i = 0; i < 80 && pos < text.length; i += 1) {
        const idx = lowerText.indexOf(lowerQ, pos);
        if (idx === -1) {
            parts.push(text.slice(pos));
            break;
        }

        if (idx > pos) {
            parts.push(text.slice(pos, idx));
        }

        parts.push(
            <mark
                key={`ord-hl-${idx}-${i}`}
                className="rounded-sm bg-amber-200 px-0.5 text-gray-900"
            >
                {text.slice(idx, idx + q.length)}
            </mark>,
        );

        pos = idx + q.length;
    }

    return parts.length > 0 ? <>{parts}</> : text;
}

export default function AdminOrdersTable({
    initialOrders,
    searchQuery = "",
    onSuccessMessageAction,
    onErrorMessageAction,
    dateFilterSummary,
    onDateFilterHeaderClickAction,
}: Props) {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [orderDetailLoading, setOrderDetailLoading] = useState(false);
    const [terminalConfirm, setTerminalConfirm] = useState<{ orderId: number; nextStatus: "done" | "cancelled" } | null>(
        null,
    );
    const [isStatusPending, startStatusTransition] = useTransition();

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    const handleStatusChange = (orderId: number, status: string) => {
        startStatusTransition(async () => {
            try {
                onErrorMessageAction?.("");
                onSuccessMessageAction?.("");

                const response = await updateOrderStatus(orderId, status);

                setOrders((prev) =>
                    prev.map((order) =>
                        order.id === orderId ? { ...order, ...response.data } : order
                    )
                );

                setSelectedOrder((prev) =>
                    prev && prev.id === orderId ? { ...prev, ...response.data } : prev
                );

                onSuccessMessageAction?.("Статус заказа обновлён");
                setTerminalConfirm(null);
            } catch (error) {
                console.error(error);
                onErrorMessageAction?.("Не удалось обновить статус");
                setTerminalConfirm(null);
            }
        });
    };

    const requestStatusChange = (orderId: number, currentStatus: string, nextStatus: string) => {
        if (nextStatus === currentStatus) {
            return;
        }
        if (TERMINAL_STATUSES.has(nextStatus)) {
            setTerminalConfirm({
                orderId,
                nextStatus: nextStatus as "done" | "cancelled",
            });
            return;
        }
        handleStatusChange(orderId, nextStatus);
    };

    const openOrderDetail = (orderId: number) => {
        setOrderDetailLoading(true);
        setSelectedOrder(null);
        void fetchOrder(orderId)
            .then((res) => {
                setSelectedOrder(res.data);
            })
            .catch((error) => {
                console.error(error);
                onErrorMessageAction?.("Не удалось загрузить заказ");
            })
            .finally(() => {
                setOrderDetailLoading(false);
            });
    };

    const formatDateOnly = (value?: string | null): string => {
        if (!value) {
            return "—";
        }
        try {
            return new Date(value).toLocaleDateString("ru-RU");
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
                            <th className="px-4 py-4">Клиент</th>
                            <th className="px-4 py-4">Телефон</th>
                            <th className="px-4 py-4">Статус</th>
                            <th className="px-4 py-4">Кол-во</th>
                            <th className="px-4 py-4">Сумма</th>
                            <th className="px-4 py-4 align-top">
                                {onDateFilterHeaderClickAction !== undefined && dateFilterSummary !== undefined ? (
                                    <button
                                        type="button"
                                        onClick={onDateFilterHeaderClickAction}
                                        className="flex max-w-[11rem] flex-col items-start gap-0.5 rounded-lg border border-transparent px-1 py-0.5 text-left transition hover:border-gray-200 hover:bg-gray-50 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        title="Фильтр по дате создания заказа"
                                    >
                                        <span className="tracking-wide text-gray-500">Дата</span>
                                        <span className="text-[10px] font-medium leading-snug text-gray-900">
                                            {dateFilterSummary}
                                        </span>
                                    </button>
                                ) : (
                                    "Дата"
                                )}
                            </th>
                            <th className="px-4 py-4">Действия</th>
                        </tr>
                    </thead>

                    <tbody className="align-middle">
                        {orders.map((order) => (
                            <tr key={order.id} className="border-b last:border-b-0">
                                <td className="px-4 py-4">
                                    <button
                                        type="button"
                                        title="Посмотреть заказ"
                                        className="text-left font-medium text-blue-600 underline decoration-blue-600/80 underline-offset-2 hover:text-blue-700 hover:decoration-blue-700"
                                        onClick={() => openOrderDetail(order.id)}
                                    >
                                        #{highlightQueryInText(String(order.id), searchQuery)}
                                    </button>
                                </td>
                                <td className="px-4 py-4">
                                    {highlightQueryInText(order.customer_name || "—", searchQuery)}
                                </td>
                                <td className="px-4 py-4">
                                    {highlightQueryInText(order.phone || "—", searchQuery)}
                                </td>
                                <td className="px-4 py-4">
                                    <AdminStatusDropdown
                                        value={order.status}
                                        options={ORDER_STATUS_OPTIONS}
                                        onChangeAction={(nextStatus) =>
                                            requestStatusChange(order.id, order.status, nextStatus)
                                        }
                                        disabled={order.status === "done" || order.status === "cancelled"}
                                        triggerVariant="text"
                                        triggerTextClassName={getOrderStatusTableTextClass(order.status)}
                                        menuWidthClassName={STATUS_DROPDOWN_MENU_WIDTH_CLASS}
                                    />
                                </td>
                                <td className="px-4 py-4">{order.items_qty}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{order.total} руб.</td>
                                <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                                    {formatDateOnly(order.created_at)}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-1.5">
                                        <Link
                                            href={`/admin/orders/${order.id}/edit`}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                                            aria-label={`Редактировать заказ #${order.id}`}
                                            title="Редактировать"
                                        >
                                            <Pencil size={16} />
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <AdminOrderItemsModal
                order={selectedOrder}
                orderDetailLoading={orderDetailLoading}
                onCloseAction={() => {
                    setSelectedOrder(null);
                    setOrderDetailLoading(false);
                }}
            />

            <AdminConfirmDialog
                open={terminalConfirm !== null}
                title={
                    terminalConfirm?.nextStatus === "done"
                        ? "Перевести заказ в «Выполнен»?"
                        : "Перевести заказ в «Отменён»?"
                }
                message={
                    terminalConfirm?.nextStatus === "done"
                        ? "Для статуса «Выполнен» будет создано складское списание по резервам, начисление по карте лояльности и выпуск купленных подарочных сертификатов (если применимо). Позже состав заказа изменить будет нельзя."
                        : "Для статуса «Отменён» будут сняты резервы на складе и выполнен возврат по подарочным сертификатам заказа (если применимо). Позже состав заказа изменить будет нельзя."
                }
                confirmText={terminalConfirm?.nextStatus === "done" ? "Выполнить" : "Отменить заказ"}
                confirmLoadingText="Сохранение..."
                cancelText="Назад"
                loading={isStatusPending}
                onCloseAction={() => setTerminalConfirm(null)}
                onConfirmAction={() => {
                    if (!terminalConfirm) {
                        return;
                    }
                    handleStatusChange(terminalConfirm.orderId, terminalConfirm.nextStatus);
                }}
            />
        </>
    );
}