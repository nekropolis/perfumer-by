"use client";

import type { OrderData } from "@/types/orders";

type Props = {
    order: OrderData | null;
    onCloseAction: () => void;
};

export default function AdminOrderItemsModal({ order, onCloseAction }: Props) {
    if (!order) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onCloseAction}
        >
            <div
                className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-2xl font-semibold">Заказ #{order.id}</h3>
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

                <div className="space-y-4">
                    {order.items.map((item) => (
                        <div key={item.id} className="rounded-2xl border p-4">
                            <div className="text-sm text-gray-500">{item.brand_name || "—"}</div>
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
        </div>
    );
}