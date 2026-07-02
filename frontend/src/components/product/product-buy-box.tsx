"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import StockNotificationModal from "@/components/product/stock-notification-modal";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import type { ProductVariantData } from "@/types/catalog";
import {
    formatVariantConcentrationLabel,
    formatVariantVolumeLine,
    getVariantAvailabilityState,
} from "@/lib/product-detail-utils";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

type Props = {
    selectedVariant: ProductVariantData | null;
    isSelectedVariantInCart: boolean;
    isPending: boolean;
    onAddToCartAction: () => void;
    formatPriceAction: (price: string | null) => string;
    productId: number;
    productName: string;
    /** Нет остатка на своём складе; заказ через поставщика — другой текст, чем «В наличии». */
    isProductOutOfStock?: boolean;
    displayPrice?: string | null;
    loyaltyCardNumber?: string | null;
    loyaltyPercent?: number;
    waitingDiscountActive?: boolean;
    waitingDiscountForced?: boolean;
    waitingDiscountPercent?: number;
    waitingDiscountApplicable?: boolean;
    onWaitingDiscountChangeAction?: (active: boolean) => void;
    deliveryDate?: string | null;
};

export default function ProductBuyBox({
    selectedVariant,
    isSelectedVariantInCart,
    isPending,
    onAddToCartAction,
    formatPriceAction,
    productId,
    productName,
    isProductOutOfStock = false,
    displayPrice,
    loyaltyCardNumber,
    loyaltyPercent = 0,
    waitingDiscountActive = false,
    waitingDiscountForced = false,
    waitingDiscountPercent = 3,
    waitingDiscountApplicable = false,
    onWaitingDiscountChangeAction,
    deliveryDate,
}: Props) {
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [mobileBarBottomOffset, setMobileBarBottomOffset] = useState(0);

    const hasVariant = selectedVariant !== null;
    const canAddToCart = hasVariant && selectedVariant.is_available;
    const selectedVariantId = selectedVariant?.id ?? null;
    const selectedVariantTitle = selectedVariant?.display_name ?? null;

    const hasLoyaltyDiscount = Boolean(
        loyaltyCardNumber &&
            loyaltyPercent > 0 &&
            selectedVariant?.price &&
            !selectedVariant.is_promotion,
    );
    const hasWaitingDiscount = Boolean(
        waitingDiscountActive && waitingDiscountApplicable && selectedVariant?.price && !selectedVariant.is_promotion,
    );
    const showWaitingCheckbox = Boolean(
        waitingDiscountApplicable && selectedVariant && !selectedVariant.is_promotion && selectedVariant.availability_source !== 'supplier_only',
    );

    const effectivePrice = displayPrice ?? selectedVariant?.price ?? null;

    const deliveryDateText = deliveryDate?.trim() || "xx.xx.xxxx";

    const availability = useMemo(() => {
        if (!selectedVariant) {
            return null;
        }

        if (waitingDiscountApplicable) {
            if (waitingDiscountActive || waitingDiscountForced) {
                return {
                    text: `Доступен к заказу. Отправка с ${deliveryDateText}`,
                    className: "text-amber-600",
                };
            }

            return { text: "Наличие в магазине", className: "text-emerald-600" };
        }

        return getVariantAvailabilityState(selectedVariant, isProductOutOfStock);
    }, [selectedVariant, waitingDiscountApplicable, waitingDiscountForced, waitingDiscountActive, deliveryDateText, isProductOutOfStock]);

    const hasAnyDiscount = hasLoyaltyDiscount || hasWaitingDiscount || selectedVariant?.discount_percent;

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const updateViewportOffsets = () => {
            const vv = window.visualViewport;
            if (!vv) {
                setMobileBarBottomOffset(0);
                return;
            }
            setMobileBarBottomOffset(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
        };

        updateViewportOffsets();
        window.visualViewport?.addEventListener("resize", updateViewportOffsets);
        window.visualViewport?.addEventListener("scroll", updateViewportOffsets);

        return () => {
            window.visualViewport?.removeEventListener("resize", updateViewportOffsets);
            window.visualViewport?.removeEventListener("scroll", updateViewportOffsets);
        };
    }, []);

    const callbackTriggerNode = (
        <CallbackRequestTrigger
            productId={productId}
            productName={productName}
            variantId={selectedVariantId}
            variantTitle={selectedVariantTitle}
        />
    );

    const renderNotifyButton = (className: string, iconClassName: string) => (
        <button type="button" onClick={() => setNotifyOpen(true)} className={`inline-flex items-center gap-2.5 ${className}`}>
            <BellRing className={iconClassName} aria-hidden />
            <span>Сообщить о появлении</span>
        </button>
    );

    const renderWaitingDiscountRow = () => {
        if (!showWaitingCheckbox) {
            return null;
        }

        return (
            <label
                className={`flex cursor-pointer items-start gap-2.5 text-xs ${
                    waitingDiscountForced ? "cursor-not-allowed opacity-80" : ""
                }`}
            >
                <span className="relative flex h-5 w-5 shrink-0 select-none items-center justify-center pt-0.5">
                    <input
                        type="checkbox"
                        checked={waitingDiscountActive}
                        disabled={waitingDiscountForced}
                        onChange={(e) => onWaitingDiscountChangeAction?.(e.target.checked)}
                        className="peer sr-only"
                    />
                    <span
                        aria-hidden
                        className={[
                            "pointer-events-none flex h-5 w-5 items-center justify-center rounded-md border-2 bg-admin-surface shadow-sm transition-all duration-200 ease-out",
                            "border-admin-border",
                            "peer-hover:border-admin-border-strong peer-hover:shadow-md",
                            "peer-focus-visible:ring-2 peer-focus-visible:ring-admin-primary/20 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-admin-surface",
                            "peer-checked:border-admin-primary peer-checked:bg-admin-primary peer-checked:shadow-sm",
                            "peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
                            "[&>svg]:scale-90 [&>svg]:opacity-0",
                            waitingDiscountForced ? "opacity-70" : "",
                        ].join(" ")}
                    >
                        <svg viewBox="0 0 12 10" fill="none" className="h-2.5 w-2.5 text-white transition-[opacity,transform] duration-200 ease-out" aria-hidden>
                            <path
                                d="M1 5l3.5 3.5L11 1.5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>
                </span>
                <span className="text-admin-text">
                    Хочу скидку {waitingDiscountPercent}% за ожидание доставки
                </span>
            </label>
        );
    };

    const renderCartAction = (compact: boolean) => {
        if (!hasVariant) {
            return (
                <button
                    type="button"
                    onClick={() => setNotifyOpen(true)}
                    className={`${siteBtnPrimary} shrink-0 ${compact ? "h-11 px-4 text-sm" : "flex-1 px-5 py-3.5 text-base"}`}
                >
                    Сообщить
                </button>
            );
        }

        if (canAddToCart) {
            if (isSelectedVariantInCart) {
                return (
                    <Link
                        href="/cart"
                        className={`${siteBtnSecondary} shrink-0 ${compact ? "inline-flex h-11 items-center justify-center px-4 text-sm" : "flex-1 cursor-pointer"}`}
                    >
                        {compact ? (
                            "В корзине"
                        ) : (
                            <>
                                <span aria-hidden>✓</span>
                                <span>&nbsp;В корзине (оформить)</span>
                            </>
                        )}
                    </Link>
                );
            }

            return (
                <button
                    type="button"
                    onClick={onAddToCartAction}
                    disabled={isPending}
                    className={`${siteBtnPrimary} shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-11 px-4 text-sm" : "flex-1 px-5 py-3.5 text-base"}`}
                >
                    {!compact && (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="h-5 w-5"
                            aria-hidden
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 3h1.386c.51 0 .955.343 1.087.836L5.61 7.5m0 0h12.84c.75 0 1.398.52 1.56 1.252l1.038 4.5a1.125 1.125 0 01-1.098 1.373H7.125a1.125 1.125 0 01-1.098-.877L5.61 7.5zM8.25 19.5a.75.75 0 100 1.5.75.75 0 000-1.5zm10.5 0a.75.75 0 100 1.5.75.75 0 000-1.5z"
                            />
                        </svg>
                    )}
                    <span>&nbsp;{isPending ? (compact ? "..." : "Добавление...") : compact ? "В корзину" : "Добавить в корзину"}</span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className={`${siteBtnSecondary} shrink-0 ${compact ? "inline-flex h-11 items-center justify-center px-3 text-sm" : "flex-1 px-5 py-3.5 text-base"}`}
            >
                {compact ? "Уведомить" : "Сообщить о появлении"}
            </button>
        );
    };

    return (
        <>
            <div className={`hidden xl:block ${siteCard} p-5 sm:p-6`}>
                {hasVariant ? (
                    <>
                        <div className="mb-2 text-sm text-admin-text-secondary">Выбранный вариант</div>

                        <div className="mb-1 text-2xl font-semibold leading-tight">
                            {selectedVariant.display_name}
                        </div>

                        {selectedVariant.type && (
                            <div className="mb-5 text-sm text-admin-text-secondary">
                                {selectedVariant.type}
                            </div>
                        )}

                        <div className="mb-4 flex flex-wrap items-end gap-2">
                            <div className="text-4xl font-semibold leading-none">
                                {effectivePrice
                                    ? formatPriceAction(effectivePrice)
                                    : selectedVariant.is_preorder
                                        ? "Предзаказ"
                                        : "Цена уточняется"}
                            </div>

                            {(selectedVariant.old_price || hasAnyDiscount) && (
                                <div className="text-base text-admin-text-secondary line-through">
                                    {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                                </div>
                            )}
                        </div>

                        {hasLoyaltyDiscount && (
                            <div className="mb-2 text-sm text-green-700">
                                Скидка {loyaltyPercent.toFixed(2)}% по карте {loyaltyCardNumber}
                            </div>
                        )}

                        {hasWaitingDiscount && (
                            <div className="mb-2 text-sm text-green-700">
                                Скидка {waitingDiscountPercent}% за ожидание доставки
                            </div>
                        )}

                        {selectedVariant.discount_percent && (
                            <div className="mb-4 inline-flex rounded-full bg-admin-muted px-3 py-1 text-sm font-medium text-admin-text">
                                - {selectedVariant.discount_percent}%
                            </div>
                        )}

                        <div className="mb-4">
                            {availability ? (
                                <div className={`text-sm font-medium ${availability.className}`}>
                                    {availability.text}
                                </div>
                            ) : null}
                        </div>

                        {showWaitingCheckbox && (
                            <div className="mb-4 rounded-xl border border-admin-border bg-admin-bg p-3">
                                {renderWaitingDiscountRow()}
                            </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            {canAddToCart ? renderCartAction(false) : null}
                        </div>

                        <div className="mt-4 flex justify-center">
                            {callbackTriggerNode}
                        </div>

                        {!canAddToCart && (
                            <div className="mt-3 flex justify-center">
                                {renderNotifyButton(
                                    "inline-flex items-center gap-2.5 text-sm text-admin-text-secondary transition hover:text-admin-text",
                                    "h-4 w-4",
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="mb-4 text-xl font-semibold leading-tight text-admin-text">
                            Ожидается поступление
                        </div>
                        <p className="mb-5 text-sm leading-6 text-admin-text-secondary">
                            Оставьте номер телефона — мы Вам сообщим, как только товар появится в продаже,
                            и сразу сориентируем по цене.
                        </p>

                        {renderNotifyButton(
                            `${siteBtnPrimary} w-full px-5 py-3.5 text-base`,
                            "h-5 w-5",
                        )}

                        <div className="mt-4 flex justify-center">
                            {callbackTriggerNode}
                        </div>
                    </>
                )}
            </div>

            <div
                className="fixed inset-x-0 bottom-0 z-[130] border-t border-admin-border bg-admin-surface/95 px-3 pt-2.5 backdrop-blur xl:hidden"
                style={{
                    bottom: `${mobileBarBottomOffset}px`,
                    paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                }}
            >
                <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
                    <div className="min-w-0 flex-1">
                        {hasVariant ? (
                            <>
                                <div className="truncate text-sm font-semibold leading-5 text-admin-text">
                                    {productName}
                                </div>
                                <div className="text-[11px] text-admin-text-secondary">Выбранный вариант</div>
                                <div className="truncate text-sm font-medium leading-5 text-admin-text">
                                    {formatVariantVolumeLine(selectedVariant)}
                                </div>
                                <div className="truncate text-xs leading-4 text-admin-text-secondary">
                                    {formatVariantConcentrationLabel(selectedVariant)}
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="text-base font-semibold text-admin-text">
                                        {effectivePrice
                                            ? formatPriceAction(effectivePrice)
                                            : selectedVariant.is_preorder
                                                ? "Предзаказ"
                                                : "Цена уточняется"}
                                    </span>
                                    {availability ? (
                                        <span className={`text-xs ${availability.className}`}>
                                            {availability.text}
                                        </span>
                                    ) : null}
                                </div>
                                {showWaitingCheckbox && (
                                    <div className="mt-1">{renderWaitingDiscountRow()}</div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="truncate text-sm font-medium text-admin-text">
                                    {productName}
                                </div>
                                <div className="text-xs text-admin-text-secondary">Выберите вариант</div>
                            </>
                        )}
                    </div>
                    {renderCartAction(true)}
                </div>
            </div>

            <StockNotificationModal
                open={notifyOpen}
                onCloseAction={() => setNotifyOpen(false)}
                productId={productId}
                productName={productName}
                variantId={selectedVariantId}
                variantTitle={selectedVariantTitle}
            />
        </>
    );
}
