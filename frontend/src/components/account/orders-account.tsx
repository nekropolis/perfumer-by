"use client";

import { getOrderStatusLabel, getOrderStatusStyle } from "@/constants/order-statuses";
import { useEffect, useState, startTransition, useCallback } from "react";
import { fetchMyOrders } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import OrderModal from "@/components/account/order-modal";
import AccountProfileEditPanel from "@/components/account/account-profile-edit-panel";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { formatOrderLoyaltyCardDiscountReason } from "@/lib/loyalty-pricing";
import type { AuthUserProfile } from "@/lib/auth-api";
import { siteBtnPrimary, siteCard } from "@/lib/site-ui-classes";

type OrdersAccountProps = {
    isAuthenticated: boolean;
    isProfileEditing?: boolean;
    user?: AuthUserProfile | null;
    profileSaveNotice?: string;
    onProfileSavedAction?: () => void;
    onProfileCancelAction?: () => void;
};

function parseMoney(value: string | undefined | null): number {
    if (!value) return 0;
    const normalized = value.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function OrdersAccount({
    isAuthenticated,
    isProfileEditing = false,
    user = null,
    profileSaveNotice = "",
    onProfileSavedAction,
    onProfileCancelAction,
}: OrdersAccountProps) {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(isAuthenticated);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

    const loadOrders = useCallback(
        async (showLoader: boolean) => {
            if (!isAuthenticated) return;

            if (showLoader) {
                startTransition(() => {
                    setOrdersLoading(true);
                    setErrorMessage("");
                });
            }

            try {
                const response = await fetchMyOrders();
                setOrders(response.data);
                setErrorMessage("");
            } catch {
                setErrorMessage("Не удалось загрузить заказы");
            } finally {
                if (showLoader) {
                    setOrdersLoading(false);
                }
            }
        },
        [isAuthenticated],
    );

    useEffect(() => {
        if (!isAuthenticated) return;

        let cancelled = false;
        const safeLoad = async (showLoader: boolean) => {
            if (cancelled) return;
            await loadOrders(showLoader);
        };

        void safeLoad(true);

        const intervalId = window.setInterval(() => {
            void safeLoad(false);
        }, 20000);

        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === "visible") {
                void safeLoad(false);
            }
        };

        window.addEventListener("focus", handleVisibilityOrFocus);
        document.addEventListener("visibilitychange", handleVisibilityOrFocus);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleVisibilityOrFocus);
            document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
        };
    }, [isAuthenticated, loadOrders]);

    useEffect(() => {
        if (isAuthenticated) return;
        setOrders([]);
        setOrdersLoading(false);
        setErrorMessage("");
        setSelectedOrderId(null);
    }, [isAuthenticated]);

    useEffect(() => {
        if (!selectedOrderId) return;

        const exists = orders.some((order) => order.id === selectedOrderId);
        if (!exists) {
            setSelectedOrderId(null);
        }
    }, [orders, selectedOrderId]);

    useEffect(() => {
        if (isProfileEditing) {
            setSelectedOrderId(null);
        }
    }, [isProfileEditing]);

    const totalOrders = orders.length;
    const totalSpent = orders
        .filter((order) => order.status === "done")
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return (
        <>
            <section className="space-y-6">
                {profileSaveNotice && !isProfileEditing ? (
                    <div
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                        role="status"
                    >
                        {profileSaveNotice}
                    </div>
                ) : null}

                {isProfileEditing && user && onProfileSavedAction && onProfileCancelAction ? (
                    <AccountProfileEditPanel
                        user={user}
                        onSavedAction={onProfileSavedAction}
                        onCancelAction={onProfileCancelAction}
                    />
                ) : (
                <>
                <div className={`${siteCard} p-5 sm:p-6`}>
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Информация
                    </div>

                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-admin-text">
                        Мои заказы
                    </h2>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-admin-muted p-4">
                            <div className="text-xs uppercase tracking-[0.1em] text-admin-text-secondary">
                                Всего заказов
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-admin-text">
                                {totalOrders}
                            </div>
                        </div>

                        <div className="rounded-xl bg-admin-muted p-4">
                            <div className="text-xs uppercase tracking-[0.1em] text-admin-text-secondary">
                                Сумма
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-admin-text">
                                {formatMoneyDisplay(totalSpent) ?? "0,00"} BYN
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`${siteCard} p-4 sm:p-5`}>
                    {ordersLoading && (
                        <div className="rounded-xl bg-admin-muted px-5 py-8 text-admin-text-secondary">
                            Загрузка заказов...
                        </div>
                    )}

                    {!ordersLoading && errorMessage && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    {!ordersLoading && orders.length === 0 && !errorMessage && (
                        <div className="rounded-xl border border-dashed border-admin-border bg-admin-muted/50 px-5 py-10 text-center text-admin-text-secondary">
                            У вас пока нет заказов.
                        </div>
                    )}

                    {!ordersLoading && orders.length > 0 && (
                        <div className="space-y-3">
                            {orders.map((order) => {
                                return (
                                    <article
                                        key={order.id}
                                        className={`${siteCard} p-4 transition hover:border-admin-border-strong hover:shadow-md sm:p-5`}
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <h3 className="text-lg font-semibold text-admin-text">
                                                        Заказ #{order.id}
                                                    </h3>

                                                    <div
                                                        className={`rounded-full px-3 py-1 text-xs ${getOrderStatusStyle(order.status)}`}
                                                    >
                                                        {getOrderStatusLabel(order.status)}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-sm text-admin-text-secondary">
                                                    {order.items_qty} товаров ·{" "}
                                                    {formatMoneyDisplay(order.total) ?? order.total} BYN
                                                </div>
                                                {(() => {
                                                    const cardDiscount = parseMoney(order.discount_amount);
                                                    const certificateDiscount = parseMoney(order.gift_certificate_amount);
                                                    const totalDiscount = cardDiscount + certificateDiscount;
                                                    if (totalDiscount <= 0.004) {
                                                        return null;
                                                    }

                                                    const reasonParts: string[] = [];
                                                    if (cardDiscount > 0.004) {
                                                        reasonParts.push(
                                                            formatOrderLoyaltyCardDiscountReason(
                                                                order.discount_card_number,
                                                                order.discount_percent_snapshot,
                                                            ),
                                                        );
                                                    }
                                                    if (certificateDiscount > 0.004) {
                                                        reasonParts.push("подарочный сертификат");
                                                    }

                                                    return (
                                                        <div className="mt-1 text-xs font-medium text-emerald-700">
                                                            Скидка: −{formatMoneyDisplay(totalDiscount) ?? "0,00"}{" "}
                                                            BYN
                                                            {reasonParts.length > 0 ? ` · ${reasonParts.join(", ")}` : ""}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setSelectedOrderId(order.id)}
                                                className={`${siteBtnPrimary} shrink-0 px-4 py-2.5 text-sm`}
                                            >
                                                Подробнее
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
                </>
                )}
            </section>

            {!isProfileEditing ? (
            <OrderModal
                orderId={selectedOrderId}
                onCloseOrderAction={() => setSelectedOrderId(null)}
            />
            ) : null}
        </>
    );
}
