"use client";

import { useEffect, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import type { OrderData } from "@/types/orders";
import AdminOrderItemsTable from "@/components/admin/admin-order-items-table";

type Props = {
    order: OrderData | null;
    onCloseAction: () => void;
};

export default function AdminOrderItemsModal({ order, onCloseAction }: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        startTransition(() => {
            setMounted(true);
        });
    }, []);

    useEffect(() => {
        if (!order) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [order]);

    if (!order || !mounted) {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-order-items-title"
            >
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h3 id="admin-order-items-title" className="text-2xl font-semibold">
                            Заказ #{order.id}
                        </h3>
                        <div className="mt-2 text-sm text-gray-600">
                            Товаров: {order.items_qty} · Сумма: {order.total} руб.
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border text-lg"
                    >
                        ×
                    </button>
                </div>

                <div className="max-h-[min(60vh,520px)] overflow-y-auto pr-1">
                    <AdminOrderItemsTable items={order.items} />
                </div>

                <div className="mt-6 border-t pt-4 text-right">
                    <div className="text-sm text-gray-500">Итого</div>
                    <div className="text-2xl font-semibold">{order.total} руб.</div>
                </div>
            </div>
        </div>,
        document.body
    );
}
