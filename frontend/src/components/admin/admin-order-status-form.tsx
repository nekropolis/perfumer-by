"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateOrderStatus } from "@/lib/admin-orders-api";
import { ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";

type Props = {
    orderId: number;
    currentStatus: string;
};

const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

export default function AdminOrderStatusForm({ orderId, currentStatus }: Props) {
    const router = useRouter();
    const [savedStatus, setSavedStatus] = useState(currentStatus);
    const [status, setStatus] = useState(currentStatus);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const [confirmTerminal, setConfirmTerminal] = useState<"done" | "cancelled" | null>(null);

    useEffect(() => {
        setSavedStatus(currentStatus);
        setStatus(currentStatus);
    }, [currentStatus, orderId]);

    const isTerminal = TERMINAL_STATUSES.has(savedStatus);

    const performSave = () => {
        setMessage("");
        setError("");

        startTransition(async () => {
            try {
                const response = await updateOrderStatus(orderId, status);
                const next = response.data.status;
                setSavedStatus(next);
                setStatus(next);
                setMessage("Статус обновлён");
                setConfirmTerminal(null);
                router.refresh();
            } catch (err) {
                console.error(err);
                setError(err instanceof Error ? err.message : "Ошибка обновления статуса");
                setConfirmTerminal(null);
            }
        });
    };

    const handleSave = () => {
        if (isTerminal) {
            return;
        }

        if (status === "done" && savedStatus !== "done") {
            setConfirmTerminal("done");
            return;
        }

        if (status === "cancelled" && savedStatus !== "cancelled") {
            setConfirmTerminal("cancelled");
            return;
        }

        performSave();
    };

    return (
        <div>
            <div className="mb-2 text-sm font-medium">Статус заказа</div>

            <div className="mb-3">
                <AdminStatusDropdown
                    value={status}
                    options={ORDER_STATUS_OPTIONS}
                    onChangeAction={setStatus}
                    disabled={isTerminal}
                    widthClassName="w-full"
                    menuWidthClassName="w-full"
                />
            </div>

            <button
                type="button"
                onClick={handleSave}
                disabled={isPending || isTerminal || status === savedStatus}
                className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
            >
                {isPending ? "Сохранение..." : "Сохранить"}
            </button>

            {isTerminal ? (
                <p className="mt-3 text-xs text-gray-500">
                    Статус финальный — изменить нельзя. Списание и резервы уже отражены по складу (для «Выполнен»).
                </p>
            ) : null}

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
            {message && !error ? <div className="mt-3 text-sm text-gray-600">{message}</div> : null}

            <AdminConfirmDialog
                open={confirmTerminal !== null}
                title={
                    confirmTerminal === "done"
                        ? "Завершить заказ?"
                        : confirmTerminal === "cancelled"
                          ? "Отменить заказ?"
                          : "Подтверждение"
                }
                message={
                    confirmTerminal === "done"
                        ? "Статус «Выполнен» спишет товар со склада по активным резервам. Состав заказа после этого изменить будет нельзя. Откат — только отдельными складскими документами при необходимости."
                        : confirmTerminal === "cancelled"
                          ? "Статус «Отменён» снимет резервы на складе и выполнит возврат по подарочным сертификатам заказа (если применимо). Состав заказа после этого изменить будет нельзя."
                          : ""
                }
                confirmText={confirmTerminal === "done" ? "Выполнить заказ" : "Да, отменить заказ"}
                confirmLoadingText="Сохранение..."
                cancelText="Назад"
                loading={isPending}
                onCloseAction={() => setConfirmTerminal(null)}
                onConfirmAction={() => performSave()}
            />
        </div>
    );
}
