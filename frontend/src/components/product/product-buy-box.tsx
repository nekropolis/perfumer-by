"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, ChevronRight, CirclePercent, Package, Store } from "lucide-react";
import StockNotificationModal from "@/components/product/stock-notification-modal";
import OneClickOrderTrigger from "@/components/product/one-click-order-trigger";
import type { ProductReplacementData, ProductVariantData } from "@/types/catalog";
import {
    formatSetComponentLines,
    formatVariantConcentrationLabel,
    formatVariantDesignLabel,
    formatVariantVolumeLine,
    getVariantAvailabilityState,
} from "@/lib/product-detail-utils";
import { HEADER_STICKY_EXTENSION_ID } from "@/components/layout/header/constants";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { formatDiscountPercentSnapshot } from "@/lib/loyalty-pricing";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

const emptySubscribe = () => () => { };
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const STOREFRONT_BOTTOM_BAR_HEIGHT = "--storefront-bottom-bar-height";

function PinnedInfoBadge({
    tone,
    children,
}: {
    tone: "green" | "orange" | "store";
    children: ReactNode;
}) {
    const toneClass = tone === "orange"
        ? "bg-[#FFF0E3] text-[#E96900]"
        : "bg-[#E0F7EE] text-[#087D4B]";
    const iconClass = tone === "orange" ? "text-[#F07816]" : "text-[#159B6A]";

    return (
        <div className={`inline-flex h-5 max-w-full items-center gap-1 rounded-full px-1.5 text-[12px] font-medium leading-none ${toneClass}`}>
            {tone === "orange" ? (
                <Package className={`h-3 w-3 shrink-0 ${iconClass}`} aria-hidden />
            ) : tone === "store" ? (
                <Store className={`h-3 w-3 shrink-0 ${iconClass}`} aria-hidden />
            ) : (
                <CirclePercent className={`h-3 w-3 shrink-0 ${iconClass}`} aria-hidden />
            )}
            <span className="truncate">{children}</span>
        </div>
    );
}

function DiagonalStrike({ children }: { children: ReactNode }) {
    return (
        <span className="relative inline-flex items-baseline">
            {children}
            <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                aria-hidden
            >
                <line
                    x1="0"
                    y1="92%"
                    x2="100%"
                    y2="8%"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </span>
    );
}

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
    replacement?: ProductReplacementData | null;
    surface?: "desktop" | "mobile" | "all";
    /** Иконки справа в закреплённой строке под шапкой. */
    headerActions?: ReactNode;
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
    replacement = null,
    surface = "all",
    headerActions,
}: Props) {
    const showDesktop = surface === "all" || surface === "desktop";
    const showMobile = surface === "all" || surface === "mobile";
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [pricePinned, setPricePinned] = useState(false);
    const [priceBarEntered, setPriceBarEntered] = useState(false);
    if (!pricePinned && priceBarEntered) {
        setPriceBarEntered(false);
    }
    const mobileBarRef = useRef<HTMLDivElement | null>(null);
    const priceDetailsRef = useRef<HTMLDivElement | null>(null);
    const mobileBarPortalReady = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

    const hasVariant = selectedVariant !== null;
    const canAddToCart = hasVariant && selectedVariant.is_available;
    const selectedVariantId = selectedVariant?.id ?? null;
    const selectedVariantTitle = selectedVariant?.display_name ?? null;
    const replacementTitle = replacement
        ? (replacement.display_name || replacement.product_name).trim()
        : "";
    const replacementHref = replacement ? `/${replacement.product_slug}` : null;
    const replacementImageSrc = replacement?.image
        ? normalizeProductImageUrl(replacement.image)
        : null;
    const showReplacementCta = !hasVariant && Boolean(replacementHref && replacementTitle);

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
    const designLabel = selectedVariant ? formatVariantDesignLabel(selectedVariant) : null;

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
        if (!showMobile || !mobileBarPortalReady) {
            return;
        }

        const bar = mobileBarRef.current;
        if (!bar) {
            return;
        }

        const root = document.documentElement;
        const publishHeight = () => {
            const height = Math.ceil(bar.getBoundingClientRect().height);
            if (height > 0) {
                root.style.setProperty(STOREFRONT_BOTTOM_BAR_HEIGHT, `${height}px`);
                return;
            }
            root.style.removeProperty(STOREFRONT_BOTTOM_BAR_HEIGHT);
        };

        publishHeight();
        const observer = new ResizeObserver(publishHeight);
        observer.observe(bar);

        return () => {
            observer.disconnect();
            root.style.removeProperty(STOREFRONT_BOTTOM_BAR_HEIGHT);
        };
    }, [showMobile, mobileBarPortalReady]);

    useEffect(() => {
        if (!showMobile) {
            return;
        }

        const priceEl = priceDetailsRef.current;
        if (!priceEl) {
            return;
        }

        let observer: IntersectionObserver | null = null;

        const readStickyTop = () => {
            const stickyTopRaw = getComputedStyle(document.documentElement)
                .getPropertyValue("--catalog-toolbar-sticky-top")
                .trim();
            return Number.parseFloat(stickyTopRaw) || 64;
        };

        const updatePinned = () => {
            if (window.matchMedia("(min-width: 1280px)").matches) {
                setPricePinned(false);
                return;
            }

            setPricePinned(priceEl.getBoundingClientRect().bottom <= readStickyTop());
        };

        const disconnect = () => {
            observer?.disconnect();
            observer = null;
        };

        const setup = () => {
            disconnect();
            updatePinned();
            if (window.matchMedia("(min-width: 1280px)").matches) {
                return;
            }

            const stickyTop = readStickyTop();
            observer = new IntersectionObserver(() => updatePinned(), {
                root: null,
                rootMargin: `-${stickyTop}px 0px 0px 0px`,
                threshold: [0, 1],
            });
            observer.observe(priceEl);
        };

        setup();
        window.addEventListener("scroll", updatePinned, { passive: true });
        window.addEventListener("resize", setup);

        return () => {
            window.removeEventListener("scroll", updatePinned);
            window.removeEventListener("resize", setup);
            disconnect();
        };
    }, [showMobile, selectedVariantId, effectivePrice]);

    useEffect(() => {
        if (!pricePinned) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            setPriceBarEntered(true);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [pricePinned]);

    const oneClickTriggerNode = (
        <OneClickOrderTrigger
            productId={productId}
            productName={productName}
            variantId={selectedVariantId}
            variantTitle={selectedVariantTitle}
            disabled={!canAddToCart}
        />
    );

    const renderNotifyButton = (className: string, iconClassName: string) => (
        <button type="button" onClick={() => setNotifyOpen(true)} className={`inline-flex items-center gap-2.5 ${className}`}>
            <BellRing className={iconClassName} aria-hidden />
            <span>Сообщить о появлении</span>
        </button>
    );

    const renderReplacementThumb = (sizeClassName: string) => (
        <div
            className={`relative shrink-0 overflow-hidden rounded-xl bg-admin-muted ${sizeClassName}`}
        >
            {replacementImageSrc ? (
                <Image
                    src={replacementImageSrc}
                    alt={replacementTitle}
                    fill
                    sizes="72px"
                    loader={productImageLoader}
                    className="object-contain p-1"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-admin-text-secondary">
                    Нет фото
                </div>
            )}
        </div>
    );

    const renderReplacementPanel = () => {
        if (!replacementHref || !replacementTitle) {
            return null;
        }

        return (
            <div className="flex flex-col gap-4">
                <div className="flex items-stretch gap-3">
                    {renderReplacementThumb("h-[4.5rem] w-[4.5rem]")}
                    <div className="w-px shrink-0 self-stretch bg-admin-border" aria-hidden />
                    <div className="min-w-0 flex-1 self-center">
                        <div className="text-sm leading-5 text-admin-text-secondary">
                            Предлагаем замену –
                        </div>
                        <div className="mt-0.5 text-base font-semibold leading-snug text-admin-text">
                            {replacementTitle}
                        </div>
                    </div>
                </div>
                <Link
                    href={replacementHref}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-admin-primary px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-admin-primary-hover active:scale-[0.98]"
                >
                    Посмотреть замену
                    <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
                </Link>
            </div>
        );
    };

    const renderReplacementMobileAction = () => {
        if (!replacementHref) {
            return null;
        }

        return (
            <Link
                href={replacementHref}
                className={`${siteBtnPrimary} inline-flex h-12 w-full items-center justify-center gap-1 px-4 text-base`}
            >
                Посмотреть замену
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
        );
    };

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
            if (showReplacementCta) {
                return renderReplacementMobileAction();
            }

            return (
                <button
                    type="button"
                    onClick={() => setNotifyOpen(true)}
                    className={`${siteBtnPrimary} shrink-0 ${compact ? "h-12 w-full px-3 text-base" : "flex-1 px-5 py-3.5 text-base"}`}
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
                        className={`${siteBtnSecondary} shrink-0 ${compact ? "inline-flex h-12 w-full items-center justify-center px-3 text-base" : "flex-1 cursor-pointer"}`}
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
                    <span>
                        {compact ? "" : "\u00A0"}
                        {isPending ? (compact ? "..." : "Добавление...") : compact ? "В корзину" : "Добавить в корзину"}
                    </span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className={`${siteBtnSecondary} shrink-0 ${compact ? "inline-flex h-12 w-full items-center justify-center px-3 text-base" : "flex-1 px-5 py-3.5 text-base"}`}
            >
                {compact ? "Уведомить" : "Сообщить о появлении"}
            </button>
        );
    };

    const priceLabel = !hasVariant
        ? "Ожидается поступление"
        : effectivePrice
            ? null
            : selectedVariant.is_preorder
                ? "Предзаказ"
                : "Цена уточняется";

    const selectedVariantLine = !selectedVariant
        ? null
        : selectedVariant.is_set
            ? "Набор"
            : [formatVariantVolumeLine(selectedVariant), formatVariantConcentrationLabel(selectedVariant)]
                .filter((part) => part.trim().length > 0)
                .join(" · ");

    const loyaltyPercentLabel = formatDiscountPercentSnapshot(String(loyaltyPercent)) ?? String(loyaltyPercent);
    const loyaltyDiscountLabel = hasLoyaltyDiscount ? `Скидка ${loyaltyPercentLabel}% по карте` : null;
    const waitingDiscountLabel = hasWaitingDiscount
        ? `Скидка ${waitingDiscountPercent}% за ожидание доставки`
        : null;
    const pinnedConditionText = availability
        ? [availability.status, availability.shipping].filter(Boolean).join(" · ")
        : null;

    const priceStatusBadges = loyaltyDiscountLabel || waitingDiscountLabel || availability ? (
        <div className="flex flex-col items-start gap-1">
            {loyaltyDiscountLabel ? <PinnedInfoBadge tone="green">{loyaltyDiscountLabel}</PinnedInfoBadge> : null}
            {waitingDiscountLabel ? <PinnedInfoBadge tone="green">{waitingDiscountLabel}</PinnedInfoBadge> : null}
            {availability ? (
                availability.shipping ? (
                    <PinnedInfoBadge tone="orange">
                        {[availability.status, availability.shipping].filter(Boolean).join(" · ")}
                    </PinnedInfoBadge>
                ) : availability.status === "Наличие в магазине" ? (
                    <PinnedInfoBadge tone="store">{availability.status}</PinnedInfoBadge>
                ) : (
                    <div className={`text-sm font-medium ${availability.className}`}>
                        {availability.status}
                    </div>
                )
            ) : null}
        </div>
    ) : null;

    const mobilePriceDetails = showMobile ? (
        <div ref={priceDetailsRef} className="mb-3 xl:hidden">
            {hasVariant ? (
                <>
                    <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                        <div className="text-2xl font-semibold leading-none tabular-nums text-admin-text">
                            {effectivePrice ? formatPriceAction(effectivePrice) : priceLabel}
                        </div>
                        {(selectedVariant.old_price || hasAnyDiscount) ? (
                            <div className="text-base font-medium leading-none text-admin-text-secondary">
                                <DiagonalStrike>
                                    {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                                </DiagonalStrike>
                            </div>
                        ) : null}
                        {selectedVariant.discount_percent ? (
                            <div className="inline-flex rounded-full bg-admin-muted px-2 py-0.5 text-xs font-medium text-admin-text">
                                - {selectedVariant.discount_percent}%
                            </div>
                        ) : null}
                    </div>
                    {selectedVariantLine ? (
                        <div className="mt-1.5 text-sm font-medium text-admin-text">{selectedVariantLine}</div>
                    ) : null}
                    {priceStatusBadges ? <div className="mt-1.5">{priceStatusBadges}</div> : null}
                </>
            ) : showReplacementCta ? (
                <div className="flex min-w-0 items-center gap-2.5">
                    {renderReplacementThumb("h-12 w-12")}
                    <div className="min-w-0">
                        <div className="text-xs text-admin-text-secondary">Предлагаем замену</div>
                        <div className="truncate text-sm font-semibold text-admin-text">{replacementTitle}</div>
                    </div>
                </div>
            ) : (
                <div className="text-sm font-medium text-admin-text">Ожидается поступление</div>
            )}
        </div>
    ) : null;

    const mobileBar = (
        <div
            ref={mobileBarRef}
            className="fixed inset-x-0 z-[130] border-t border-admin-border bg-admin-surface/95 px-3 py-2 backdrop-blur xl:hidden"
            style={{
                bottom: "calc(var(--storefront-tab-bar-height, env(safe-area-inset-bottom)) + var(--storefront-keyboard-inset, 0px))",
            }}
        >
            <div className="mx-auto w-full max-w-7xl">
                {showWaitingCheckbox ? <div className="mb-2">{renderWaitingDiscountRow(true)}</div> : null}
                <div className={`grid gap-2 ${canAddToCart ? "grid-cols-2" : "grid-cols-1"}`}>
                {canAddToCart ? (
                    <OneClickOrderTrigger
                        productId={productId}
                        productName={productName}
                        variantId={selectedVariantId}
                        variantTitle={selectedVariantTitle}
                        label="Купить сейчас"
                        appearance="button"
                        className={`${siteBtnSecondary} h-12 w-full px-3 text-base`}
                    />
                ) : null}
                {renderCartAction(true)}
                </div>
            </div>
        </div>
    );

    const headerSlot = mobileBarPortalReady ? document.getElementById(HEADER_STICKY_EXTENSION_ID) : null;
    const pinnedPriceBar = pricePinned && headerSlot ? (
        <div
            className={[
                "border-t border-admin-border bg-admin-surface px-3 py-1.5 transition-[opacity,transform] duration-300 ease-out xl:hidden",
                priceBarEntered ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            ].join(" ")}
        >
            <div className="min-w-0">
                {productName ? (
                    <div className="truncate text-[15px] font-semibold leading-none text-[#141C2E]">{productName}</div>
                ) : null}
                {showReplacementCta && !hasVariant ? (
                    <div className="mt-0.5 truncate text-xs leading-none text-admin-text-secondary">Предлагаем замену</div>
                ) : selectedVariantLine ? (
                    <div className="mt-0.5 truncate text-xs leading-none text-[#667085]">{selectedVariantLine}</div>
                ) : null}
                <div className="mt-1 flex min-w-0 items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="truncate text-lg font-semibold leading-none tabular-nums text-[#141C2E]">
                            {showReplacementCta && !hasVariant
                                ? replacementTitle
                                : hasVariant && effectivePrice
                                    ? formatPriceAction(effectivePrice)
                                    : priceLabel}
                        </span>
                        {hasVariant && (selectedVariant.old_price || hasAnyDiscount) ? (
                            <span className="text-sm font-medium leading-none text-admin-text-secondary">
                                <DiagonalStrike>
                                    {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                                </DiagonalStrike>
                            </span>
                        ) : null}
                    </div>
                    {headerActions ? <div className="flex shrink-0 items-center gap-1">{headerActions}</div> : null}
                </div>
                {loyaltyDiscountLabel || waitingDiscountLabel || pinnedConditionText ? (
                    <div className="mt-1 flex flex-col items-start gap-0.5">
                        {loyaltyDiscountLabel ? <PinnedInfoBadge tone="green">{loyaltyDiscountLabel}</PinnedInfoBadge> : null}
                        {waitingDiscountLabel ? <PinnedInfoBadge tone="green">{waitingDiscountLabel}</PinnedInfoBadge> : null}
                        {pinnedConditionText ? (
                            availability?.shipping ? (
                                <PinnedInfoBadge tone="orange">{pinnedConditionText}</PinnedInfoBadge>
                            ) : availability?.status === "Наличие в магазине" ? (
                                <PinnedInfoBadge tone="store">{pinnedConditionText}</PinnedInfoBadge>
                            ) : (
                                <div className={`truncate text-xs ${availability?.className ?? "text-admin-text-secondary"}`}>
                                    {pinnedConditionText}
                                </div>
                            )
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    ) : null;

    return (
        <>
            {mobilePriceDetails}
            {showDesktop ? (
                <div className={`hidden xl:block ${siteCard} p-5 sm:p-6`}>
                    {hasVariant ? (
                        <>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                <div className="text-2xl font-semibold leading-tight">
                                    {selectedVariant.is_set ? "Набор" : selectedVariant.display_name}
                                </div>
                                {designLabel ? (
                                    <span className="inline-flex items-center rounded-full bg-admin-muted px-2.5 py-0.5 text-xs font-medium text-admin-text">
                                        {designLabel}
                                    </span>
                                ) : null}
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
                                    <div className="self-start mt-0.5 text-xl font-medium leading-none text-admin-text-secondary">
                                        <DiagonalStrike>
                                            {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                                        </DiagonalStrike>
                                    </div>
                                )}

                                {selectedVariant.discount_percent ? (
                                    <div className="inline-flex self-start rounded-full bg-admin-muted px-3 py-1 text-sm font-medium text-admin-text">
                                        - {selectedVariant.discount_percent}%
                                    </div>
                                ) : null}
                            </div>

                            {priceStatusBadges ? <div className="mb-4">{priceStatusBadges}</div> : null}

                            {showWaitingCheckbox ? <div className="mb-4">{renderWaitingDiscountRow()}</div> : null}

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                {canAddToCart ? renderCartAction(false) : null}
                            </div>

                            {canAddToCart ? (
                                <div className="mt-4 flex justify-center">
                                    {oneClickTriggerNode}
                                </div>
                            ) : null}

                            {!canAddToCart && (
                                <div className="mt-3 flex justify-center">
                                    {renderNotifyButton(
                                        "inline-flex items-center gap-2.5 text-sm text-admin-text-secondary transition hover:text-admin-text",
                                        "h-4 w-4",
                                    )}
                                </div>
                            )}
                        </>
                    ) : showReplacementCta ? (
                        renderReplacementPanel()
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
                        </>
                    )}
                </div>
            ) : null}

            {showMobile && mobileBarPortalReady ? createPortal(mobileBar, document.body) : null}
            {pinnedPriceBar && headerSlot ? createPortal(pinnedPriceBar, headerSlot) : null}

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
