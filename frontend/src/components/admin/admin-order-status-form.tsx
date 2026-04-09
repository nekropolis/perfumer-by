"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/lib/admin-orders-api";

type Props = {
    orderId: number;
    currentStatus: string;
};

const STATUSES = ["new", "confirmed", "processing", "done", "cancelled"];

export default function AdminOrderStatusForm({
                                                 orderId,
                                                 currentStatus,
                                             }: Props) {
    const [status, setStatus] = useState(currentStatus);
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    const handleSave = () => {
        setMessage("");

        startTransition(async () => {
            try {
                const response = await updateOrderStatus(orderId, status);
                setStatus(response.data.status);
                setMessage("Статус обновлён");
            } catch (error) {
                console.error(error);
                setMessage("Ошибка обновления статуса");
            }
        });
    };

    return (
        <div>
            <div className="mb-2 text-sm font-medium">Статус заказа</div>

            <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mb-3 w-full rounded-xl border px-4 py-3"
            >
                {STATUSES.map((item) => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}
            </select>

            <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
            >
                {isPending ? "Сохранение..." : "Сохранить"}
            </button>

            {message && (
                <div className="mt-3 text-sm text-gray-600">
                    {message}
                </div>
            )}
        </div>
    );
}