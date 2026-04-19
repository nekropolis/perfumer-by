"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import { syncOrderInventoryWriteoff } from "@/lib/admin-orders-api";

type Props = {
    orderId: number;
    canSync: boolean;
};

export default function AdminOrderInventorySync({ orderId, canSync }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    if (!canSync) {
        return null;
    }

    const runSync = () => {
        setError("");
        setMessage("");

        startTransition(async () => {
            try {
                await syncOrderInventoryWriteoff(orderId);
                setMessage("Списание создано.");
                setOpen(false);
                router.refresh();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Ошибка");
                setOpen(false);
            }
        });
    };

    return (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="text-sm font-medium text-amber-950">Склад: списание не найдено</div>
            <p className="mt-1 text-xs text-amber-900/90">
                Для выполненного заказа нет документа списания по резервам (например, из‑за сбоя ранее). Можно создать его
                сейчас — по активным резервам строк заказа.
            </p>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={isPending}
                className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100/60 disabled:opacity-50"
            >
                Создать списание по резервам
            </button>
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            {message && !error ? <p className="mt-2 text-xs text-emerald-800">{message}</p> : null}

            <AdminConfirmDialog
                open={open}
                title="Создать списание?"
                message="Будет создано складское списание по активным резервам этого заказа (как при переводе в «Выполнен»). Убедитесь, что резервы на складе ещё актуальны."
                confirmText="Создать"
                confirmLoadingText="Создание..."
                cancelText="Отмена"
                loading={isPending}
                onCloseAction={() => setOpen(false)}
                onConfirmAction={() => runSync()}
            />
        </div>
    );
}
