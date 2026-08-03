"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updateOrderStatus } from "@/lib/admin-orders-api";
import { getOrderStatusColor, getOrderStatusLabel } from "@/constants/order-statuses";
import { useOrderStatusOptions } from "@/hooks/use-order-status-options";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";

type Props = {
    orderId: number;
    currentStatus: string;
    statusLabel?: string | null;
    statusColor?: string | null;
};

const COMPLETED_STATUSES = new Set(["done", "completed"]);

export default function AdminOrderStatusForm({
    orderId,
    currentStatus,
    statusLabel,
    statusColor,
}: Props) {
    const router = useRouter();
    const { options } = useOrderStatusOptions(true);
    const [savedStatus, setSavedStatus] = useState(currentStatus);
    const [status, setStatus] = useState(currentStatus);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const [confirmTerminal, setConfirmTerminal] = useState<"done" | "cancelled" | "restore" | null>(null);

    useEffect(() => {
        setSavedStatus(currentStatus);
        setStatus(currentStatus);
    }, [currentStatus, orderId]);

    const dropdownOptions = useMemo(() => {
        if (options.some((item) => item.value === status)) {
            return options;
        }
        return [
            ...options,
            {
                value: status,
                label: getOrderStatusLabel(status, statusLabel),
                color: getOrderStatusColor(status, statusColor),
            },
        ];
    }, [options, status, statusLabel, statusColor]);

    const isCompletedLocked = COMPLETED_STATUSES.has(savedStatus);

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
        if (isCompletedLocked) {
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

        if (savedStatus === "cancelled" && status !== "cancelled") {
            setConfirmTerminal("restore");
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
                    options={dropdownOptions}
                    onChangeAction={setStatus}
                    disabled={isCompletedLocked}
                    widthClassName="w-full"
                    menuWidthClassName="w-full"
                />
            </div>

            <button
                type="button"
                onClick={handleSave}
                disabled={isPending || isCompletedLocked || status === savedStatus}
                className={`${adminBtnPrimary} w-full`}
            >
                {isPending ? "Сохранение..." : "Сохранить"}
            </button>

            {isCompletedLocked ? (
                <p className="mt-3 text-xs text-admin-text-secondary">
                    Статус «Выполнен» изменить нельзя. Списание и резервы уже отражены по складу.
                </p>
            ) : null}

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
            {message && !error ? <div className="mt-3 text-sm text-admin-text-secondary">{message}</div> : null}

            <AdminConfirmDialog
                open={confirmTerminal !== null}
                title={
                    confirmTerminal === "done"
                        ? "Завершить заказ?"
                        : confirmTerminal === "cancelled"
                          ? "Отменить заказ?"
                          : confirmTerminal === "restore"
                            ? "Вернуть заказ из отменённых?"
                            : "Подтверждение"
                }
                message={
                    confirmTerminal === "done"
                        ? "Статус «Выполнен» спишет товар со склада по активным резервам. Состав заказа после этого изменить будет нельзя. Откат — только отдельными складскими документами при необходимости."
                        : confirmTerminal === "cancelled"
                          ? "Статус «Отменён» снимет резервы на складе и выполнит возврат по подарочным сертификатам заказа (если применимо)."
                          : confirmTerminal === "restore"
                            ? "Заказ снова станет активным: резервы на складе будут выставлены заново (если применимо). Проверьте наличие товаров и скидочную карту."
                            : ""
                }
                confirmText={
                    confirmTerminal === "done"
                        ? "Выполнить заказ"
                        : confirmTerminal === "cancelled"
                          ? "Да, отменить заказ"
                          : "Вернуть"
                }
                confirmLoadingText="Сохранение..."
                cancelText="Назад"
                loading={isPending}
                onCloseAction={() => setConfirmTerminal(null)}
                onConfirmAction={() => performSave()}
            />
        </div>
    );
}
