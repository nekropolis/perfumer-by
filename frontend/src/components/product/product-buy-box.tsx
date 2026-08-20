"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing } from "lucide-react";
import StockNotificationModal from "@/components/product/stock-notification-modal";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import type { ProductVariantData } from "@/types/catalog";
import {
    formatSetComponentLines,
    formatVariantConcentrationLabel,
    formatVariantVolumeLine,
    getVariantAvailabilityState,
} from "@/lib/product-detail-utils";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

const emptySubscribe = () => () => { };
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type Props = {
    selectedVariant: ProductVariantData | null;
    isSelectedVariantInCart: boolean;
    isPending: boolean;
    onAddToCartAction: () => void;
    formatPriceAction: (price: string | null) => ReactNode;
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
    surface?: "desktop" | "mobile" | "all";
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
    surface = "all",
}: Props) {
    const showDesktop = surface === "all" || surface === "desktop";
    const showMobile = surface === "all" || surface === "mobile";
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [mobileBarBottomOffset, setMobileBarBottomOffset] = useState(0);
    const mobileBarPortalReady = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

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
        waitingDiscountApplicable &&
        selectedVariant &&
        !selectedVariant.is_promotion &&
        selectedVariant.availability_source === "main+supplier",
    );

    const effectivePrice = displayPrice ?? selectedVariant?.price ?? null;

    const deliveryDateText = deliveryDate?.trim() || "xx.xx.xxxx";

    const availability = useMemo(() => {
        if (!selectedVariant) {
            return null;
        }

        // Офер / скидка за ожидание — статус отдельно, дата отправки отдельно (мобильный бар).
        if (waitingDiscountApplicable && (waitingDiscountActive || waitingDiscountForced)) {
            return {
                status: "Доступен к заказу",
                shipping: `Отправка с ${deliveryDateText}`,
                className: "text-amber-600",
            };
        }

        const hasStoreStock =
            selectedVariant.availability_source === "main" ||
            selectedVariant.availability_source === "main+supplier";

        if (hasStoreStock) {
            return {
                status: "Наличие в магазине",
                shipping: null as string | null,
                className: "text-emerald-600",
            };
        }

        const state = getVariantAvailabilityState(selectedVariant, isProductOutOfStock);
        return {
            status: state.text,
            shipping: null as string | null,
            className: state.className,
        };
    }, [selectedVariant, waitingDiscountApplicable, waitingDiscountForced, waitingDiscountActive, deliveryDateText, isProductOutOfStock]);

    const hasAnyDiscount = hasLoyaltyDiscount || hasWaitingDiscount || selectedVariant?.discount_percent;

    useEffect(() => {
        if (!showMobile) {
            return;
        }

        if (typeof window === "undefined") {
            return;
        }

        // Lift only for the virtual keyboard — visualViewport scroll during iOS
        // overscroll otherwise pulls the bar off the bottom edge.
        const updateViewportOffsets = () => {
            const vv = window.visualViewport;
            if (!vv) {
                setMobileBarBottomOffset(0);
                return;
            }
            const shrunkBy = window.innerHeight - vv.height;
            if (shrunkBy <= 120) {
                setMobileBarBottomOffset(0);
                return;
            }
            setMobileBarBottomOffset(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
        };

        updateViewportOffsets();
        window.visualViewport?.addEventListener("resize", updateViewportOffsets);
        window.addEventListener("resize", updateViewportOffsets);

        return () => {
            window.visualViewport?.removeEventListener("resize", updateViewportOffsets);
            window.removeEventListener("resize", updateViewportOffsets);
        };
    }, [showMobile]);

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

    const renderWaitingDiscountRow = (compact = false) => {
        if (!showWaitingCheckbox) {
            return null;
        }

        const label = waitingDiscountActive
            ? `Скидка ${waitingDiscountPercent}% за ожидание`
            : `Хочу скидку ${waitingDiscountPercent}% за ожидание`;

        return (
            <label
                className={`inline-flex cursor-pointer select-none text-admin-text ${
                    compact ? "items-center gap-2 text-[11px] leading-4" : "items-center gap-2.5 text-sm"
                } ${waitingDiscountForced ? "cursor-not-allowed opacity-80" : ""}`}
            >
                <span
                    className={`relative flex shrink-0 select-none items-center justify-center ${compact ? "h-4 w-4" : "h-5 w-5"
                        }`}
                >
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
                            "pointer-events-none flex items-center justify-center rounded-md border-2 bg-admin-surface shadow-sm transition-all duration-200 ease-out",
                            compact ? "h-4 w-4" : "h-5 w-5",
                            "border-admin-border",
                            "peer-hover:border-admin-border-strong peer-hover:shadow-md",
                            "peer-focus-visible:ring-2 peer-focus-visible:ring-admin-primary/20 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-admin-surface",
                            "peer-checked:border-admin-primary peer-checked:bg-admin-primary peer-checked:shadow-sm",
                            "peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
                            "[&>svg]:scale-90 [&>svg]:opacity-0",
                            waitingDiscountForced ? "opacity-70" : "",
                        ].join(" ")}
                    >
                        <svg
                            viewBox="0 0 12 10"
                            fill="none"
                            className={`text-white transition-[opacity,transform] duration-200 ease-out ${compact ? "h-2 w-2" : "h-2.5 w-2.5"}`}
                            aria-hidden
                        >
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
                <span className={compact ? "min-w-0 truncate" : undefined}>{label}</span>
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

    const mobileBar = (
        <div
            className="fixed inset-x-0 bottom-0 z-[130] border-t border-admin-border bg-admin-surface/95 px-3 pt-2.5 backdrop-blur xl:hidden"
            style={{
                bottom: `${mobileBarBottomOffset}px`,
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
        >
            <div className="mx-auto w-full max-w-7xl">
                <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        {hasVariant ? (
                            <>
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                                    <span className="truncate text-sm font-medium leading-5 text-admin-text">
                                        {selectedVariant.is_set
                                            ? "Набор"
                                            : formatVariantVolumeLine(selectedVariant)}
                                    </span>
                                    {availability ? (
                                        <span className={`truncate text-xs font-medium leading-5 ${availability.className}`}>
                                            · {availability.status}
                                        </span>
                                    ) : null}
                                </div>
                                {selectedVariant.is_set ? (
                                    <div className="space-y-0.5 text-xs leading-4 text-admin-text-secondary">
                                        {formatSetComponentLines(selectedVariant).map((line) => (
                                            <div key={line} className="truncate">
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="truncate text-xs leading-4 text-admin-text-secondary">
                                        {formatVariantConcentrationLabel(selectedVariant)}
                                    </div>
                                )}
                                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="text-2xl font-semibold leading-none tabular-nums text-admin-text">
                                        {effectivePrice
                                            ? formatPriceAction(effectivePrice)
                                            : selectedVariant.is_preorder
                                                ? "Предзаказ"
                                                : "Цена уточняется"}
                                    </span>
                                    {(selectedVariant.old_price || hasAnyDiscount) ? (
                                        <span className="text-sm text-admin-text-secondary line-through">
                                            {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                                        </span>
                                    ) : null}
                                </div>
                                {hasLoyaltyDiscount ? (
                                    <div className="mt-0.5 text-xs leading-4 text-green-700">
                                        Скидка {loyaltyPercent.toFixed(2)}% по карте {loyaltyCardNumber}
                                    </div>
                                ) : null}
                                {/* When checkbox is shown below, skip duplicate green line. */}
                                {hasWaitingDiscount && !showWaitingCheckbox ? (
                                    <div className="mt-0.5 text-xs leading-4 text-green-700">
                                        Скидка {waitingDiscountPercent}% за ожидание доставки
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="text-xs text-admin-text-secondary">Выберите вариант</div>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                        {renderCartAction(true)}
                        {availability?.shipping ? (
                            <div className="max-w-[6.75rem] text-center text-[10px] leading-tight text-amber-600">
                                {availability.shipping}
                            </div>
                        ) : null}
                    </div>
                </div>

                {showWaitingCheckbox ? (
                    <div className="mt-2 border-t border-admin-border/80 pt-2">
                        {renderWaitingDiscountRow(true)}
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <>
            {showDesktop ? (
                <div className={`hidden xl:block ${siteCard} p-5 sm:p-6`}>
                    {hasVariant ? (
                        <>
                            <div className="mb-1 text-2xl font-semibold leading-tight">
                                {selectedVariant.is_set ? "Набор" : selectedVariant.display_name}
                            </div>

                            {selectedVariant.is_set ? (
                                <div className="mb-5 space-y-1 text-sm text-admin-text-secondary">
                                    {formatSetComponentLines(selectedVariant).map((line) => (
                                        <div key={line}>{line}</div>
                                    ))}
                                </div>
                            ) : selectedVariant.type ? (
                                <div className="mb-5 text-sm text-admin-text-secondary">
                                    {selectedVariant.type}
                                </div>
                            ) : null}

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

                                {selectedVariant.discount_percent ? (
                                    <div className="inline-flex self-start rounded-full bg-admin-muted px-3 py-1 text-sm font-medium text-admin-text">
                                        - {selectedVariant.discount_percent}%
                                    </div>
                                ) : null}
                            </div>

                            {hasLoyaltyDiscount && (
                                <div className="mb-2 text-sm text-green-700">
                                    Скидка {loyaltyPercent.toFixed(2)}% по карте {loyaltyCardNumber}
                                </div>
                            )}

                            {hasWaitingDiscount && !showWaitingCheckbox ? (
                                <div className="mb-2 text-sm text-green-700">
                                    Скидка {waitingDiscountPercent}% за ожидание доставки
                                </div>
                            ) : null}

                            <div className="mb-4">
                                {availability ? (
                                    <div className={`text-sm font-medium ${availability.className}`}>
                                        {[availability.status, availability.shipping].filter(Boolean).join(". ")}
                                    </div>
                                ) : null}
                            </div>

                            {showWaitingCheckbox ? <div className="mb-4">{renderWaitingDiscountRow()}</div> : null}

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
            ) : null}

            {showMobile && mobileBarPortalReady ? createPortal(mobileBar, document.body) : null}

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
