"use client";

import { getOrderStatusColor, getOrderStatusLabel, orderStatusPillStyle } from "@/constants/order-statuses";
import { ChevronLeft, ChevronRight, Heart, Package } from "lucide-react";
import { useEffect, useState, startTransition, useCallback } from "react";
import { createPortal } from "react-dom";
import WishlistPageView from "@/components/wishlist/wishlist-page-view";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { fetchMyOrders } from "@/lib/my-orders-api";
import type { OrderData } from "@/types/orders";
import OrderModal from "@/components/account/order-modal";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { withBynSign } from "@/lib/byn-sign";
import { formatDiscountPercentSnapshot, formatOrderLoyaltyCardDiscountReason } from "@/lib/loyalty-pricing";
import { siteBtnPrimary, siteCard } from "@/lib/site-ui-classes";

type OrdersAccountProps = {
    isAuthenticated: boolean;
    profileSaveNotice?: string;
};

function parseMoney(value: string | undefined | null): number {
    if (!value) return 0;
    const normalized = value.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function OrdersAccount({
    isAuthenticated,
    profileSaveNotice = "",
}: OrdersAccountProps) {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(isAuthenticated);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [ordersOpen, setOrdersOpen] = useState(false);
    const [wishlistOpen, setWishlistOpen] = useState(false);
    const { wishlistQty, loading: wishlistLoading } = useWishlist();

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
        if (!ordersOpen && !wishlistOpen) {
            return;
        }
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [ordersOpen, wishlistOpen]);

    const totalOrders = orders.length;
    const totalSpent = orders
        .filter((order) => order.status === "done")
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return (
        <>
            <section className="order-3 flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-4">
                <div className="flex h-full flex-col gap-4">
                {profileSaveNotice ? (
                    <div
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                        role="status"
                    >
                        {profileSaveNotice}
                    </div>
                ) : null}

                <div className="space-y-3 md:hidden">
                <button
                    type="button"
                    onClick={() => setWishlistOpen(true)}
                    className={`${siteCard} flex w-full items-center gap-2 px-4 py-3.5 text-left`}
                >
                    <Heart className="h-5 w-5 shrink-0 text-admin-text" aria-hidden />
                    <span className="shrink-0 text-base font-semibold text-admin-text">Избранное</span>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-admin-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-admin-text">
                        {wishlistLoading ? "…" : wishlistQty}
                    </span>
                    <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-admin-text-muted" aria-hidden />
                </button>
                <button
                    type="button"
                    onClick={() => setOrdersOpen(true)}
                    className={`${siteCard} flex w-full items-center gap-2 px-4 py-3.5 text-left`}
                >
                    <Package className="h-5 w-5 shrink-0 text-admin-text" aria-hidden />
                    <span className="shrink-0 text-base font-semibold text-admin-text">Мои заказы</span>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-admin-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-admin-text">
                        {ordersLoading ? "…" : totalOrders}
                    </span>
                    <span className="inline-flex min-w-0 items-center rounded-full bg-admin-muted px-2 py-0.5 text-xs font-medium tabular-nums text-admin-text">
                        {ordersLoading ? "…" : withBynSign(formatMoneyDisplay(totalSpent) ?? "0,00")}
                    </span>
                    <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-admin-text-muted" aria-hidden />
                </button>
                </div>

                <div className={`${siteCard} hidden h-full min-h-0 flex-1 flex-col p-5 sm:p-6 md:flex`}>
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
                                {withBynSign(formatMoneyDisplay(totalSpent) ?? "0,00")}
                            </div>
                        </div>
                    </div>
                </div>
                </div>

                <div className={`${siteCard} hidden self-start p-4 sm:p-5 md:block`}>
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
                                                        {order.id}
                                                    </h3>

                                                    <div
                                                        className="rounded-full px-3 py-1 text-xs"
                                                        style={orderStatusPillStyle(
                                                            getOrderStatusColor(order.status, order.status_color),
                                                        )}
                                                    >
                                                        {getOrderStatusLabel(order.status, order.status_label)}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-sm text-admin-text-secondary">
                                                    {order.items_qty} товаров ·{" "}
                                                    {withBynSign(formatMoneyDisplay(order.total) ?? String(order.total))}
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
                                                            Скидка: −{withBynSign(formatMoneyDisplay(totalDiscount) ?? "0,00")}
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
            </section>

            {wishlistOpen
                ? createPortal(
                      <div
                          className="fixed inset-x-0 z-[145] flex flex-col bg-admin-bg md:hidden"
                          style={{
                              top: "var(--storefront-header-row-height, 52px)",
                              bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
                          }}
                      >
                          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-admin-border bg-admin-surface px-1">
                              <button
                                  type="button"
                                  onClick={() => setWishlistOpen(false)}
                                  aria-label="Назад"
                                  className="inline-flex h-11 w-11 items-center justify-center text-admin-text"
                              >
                                  <ChevronLeft className="h-5 w-5" aria-hidden />
                              </button>
                              <div className="min-w-0 truncate text-base font-semibold text-admin-text">Избранное</div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                              <WishlistPageView embedded />
                          </div>
                      </div>,
                      document.body,
                  )
                : null}

            {ordersOpen
                ? createPortal(
                      <div
                          className="fixed inset-x-0 z-[145] flex flex-col bg-admin-bg md:hidden"
                          style={{
                              top: "var(--storefront-header-row-height, 52px)",
                              bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
                          }}
                      >
                          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-admin-border bg-admin-surface px-1">
                              <button
                                  type="button"
                                  onClick={() => (selectedOrderId ? setSelectedOrderId(null) : setOrdersOpen(false))}
                                  aria-label="Назад"
                                  className="inline-flex h-11 w-11 items-center justify-center text-admin-text"
                              >
                                  <ChevronLeft className="h-5 w-5" aria-hidden />
                              </button>
                              <div className="min-w-0 truncate text-base font-semibold text-admin-text">
                                  {selectedOrderId ? String(selectedOrderId) : "Мои заказы"}
                              </div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                              {selectedOrderId ? (
                                  <OrderModal
                                      embedded
                                      orderId={selectedOrderId}
                                      onCloseOrderAction={() => setSelectedOrderId(null)}
                                  />
                              ) : (
                                  <>
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
                                          const cardDiscount = parseMoney(order.discount_amount);
                                          const cardPercent = formatDiscountPercentSnapshot(order.discount_percent_snapshot);
                                          const cardDiscountAmount = formatMoneyDisplay(order.discount_amount);
                                          const cardDiscountLabel =
                                              cardDiscount > 0.004
                                                  ? cardPercent
                                                      ? `скидка ${cardPercent}%`
                                                      : cardDiscountAmount
                                                          ? <>скидка −{withBynSign(cardDiscountAmount)}</>
                                                          : null
                                                  : null;

                                          return (
                                          <button
                                              key={order.id}
                                              type="button"
                                              onClick={() => setSelectedOrderId(order.id)}
                                              className={`${siteCard} flex w-full items-center gap-2 px-3 py-3 text-left`}
                                          >
                                              <span className="shrink-0 text-sm font-semibold text-admin-text">
                                                  {order.id}
                                              </span>
                                              <span
                                                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                                                  style={orderStatusPillStyle(
                                                      getOrderStatusColor(order.status, order.status_color),
                                                  )}
                                              >
                                                  {getOrderStatusLabel(order.status, order.status_label)}
                                              </span>
                                              <span className="min-w-0 flex-1 truncate text-xs text-admin-text-secondary">
                                                  {order.items_qty} товаров ·{" "}
                                                  {withBynSign(formatMoneyDisplay(order.total) ?? String(order.total))}
                                              </span>
                                              {cardDiscountLabel ? (
                                                  <span className="shrink-0 text-[11px] font-medium text-emerald-700">
                                                      {cardDiscountLabel}
                                                  </span>
                                              ) : null}
                                              <ChevronRight className="h-4 w-4 shrink-0 text-admin-text-muted" aria-hidden />
                                          </button>
                                          );
                                      })}
                                  </div>
                              )}
                                  </>
                              )}
                          </div>
                      </div>,
                      document.body,
                  )
                : null}

            {!ordersOpen ? (
            <OrderModal
                orderId={selectedOrderId}
                onCloseOrderAction={() => setSelectedOrderId(null)}
            />
            ) : null}
        </>
    );
}
