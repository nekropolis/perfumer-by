"use client";

import Link from "next/link";
import { BadgePercent, Check, ChevronLeft, Package, Truck, UserRound, Wallet } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADER_STICKY_EXTENSION_ID } from "@/components/layout/header/constants";
import { formatMoneyMinorUnits, parseMoneyMinorUnits } from "@/lib/format-byn";
import { formatMoneyRub } from "@/lib/format-money-display";
import { siteBtnPrimary, siteCard } from "@/lib/site-ui-classes";

export const CHECKOUT_SUCCESS_SUMMARY_KEY = "checkout-success-summary";

export type CheckoutSuccessSummary = {
    id: number;
    itemsQty: number;
    subtotal: string;
    waitingDiscount: string;
    discountAmount: string;
    discountPercent: string;
    giftAmount: string;
    deliveryFee: string;
    total: string;
};

let summaryCacheKey = "";
let summaryCache: CheckoutSuccessSummary | null = null;

function readSummary(orderId: string): CheckoutSuccessSummary | null {
    if (typeof window === "undefined") {
        return null;
    }
    let raw: string | null = null;
    if (orderId !== "") {
        try {
            raw = sessionStorage.getItem(CHECKOUT_SUCCESS_SUMMARY_KEY);
        } catch {
            raw = null;
        }
    }
    const key = `${orderId}\n${raw ?? ""}`;
    if (key === summaryCacheKey) {
        return summaryCache;
    }
    summaryCacheKey = key;
    summaryCache = null;
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as CheckoutSuccessSummary;
        if (parsed && String(parsed.id) === orderId) {
            summaryCache = parsed;
        }
    } catch {
        summaryCache = null;
    }
    return summaryCache;
}

function shortPercent(raw: string): string {
    const trimmed = raw.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        return raw.trim();
    }
    const [whole, frac = ""] = trimmed.split(".");
    const fracTrim = frac.replace(/0+$/, "");
    return fracTrim ? `${whole},${fracTrim}` : whole;
}

function InfoRow({
    icon,
    label,
    value,
    valueClassName,
}: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    valueClassName?: string;
}) {
    return (
        <div className="flex items-center gap-3 py-2.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-admin-text-secondary">
                {icon}
            </span>
            <span className="min-w-0 text-sm text-admin-text">{label}</span>
            <span className={`ml-auto shrink-0 text-sm tabular-nums text-admin-text ${valueClassName ?? ""}`}>
                {value}
            </span>
        </div>
    );
}

export default function CheckoutSuccessView({ orderId }: { orderId: string }) {
    const headerSlotReady = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );
    const [summary, setSummary] = useState<CheckoutSuccessSummary | null>(null);
    useEffect(() => {
        setSummary(readSummary(orderId));
    }, [orderId]);

    const headerSlot =
        headerSlotReady && typeof document !== "undefined"
            ? document.getElementById(HEADER_STICKY_EXTENSION_ID)
            : null;

    const waitingMinor = parseMoneyMinorUnits(summary?.waitingDiscount);
    const loyaltyMinor = parseMoneyMinorUnits(summary?.discountAmount);
    const giftMinor = parseMoneyMinorUnits(summary?.giftAmount);
    const deliveryMinor = parseMoneyMinorUnits(summary?.deliveryFee);
    const sumMinor = parseMoneyMinorUnits(summary?.subtotal) + waitingMinor;
    const loyaltyPercent = shortPercent(summary?.discountPercent ?? "");

    const titleBar =
        headerSlot != null
            ? createPortal(
                  <div className="flex items-center gap-0.5 border-t border-admin-border px-1.5 py-1 md:hidden">
                      <Link
                          href="/catalog"
                          aria-label="В каталог"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-admin-text"
                      >
                          <ChevronLeft className="h-5 w-5" aria-hidden />
                      </Link>
                      <h1 className="min-w-0 truncate text-[15px] font-semibold leading-none text-admin-text">
                          Заказ оформлен!
                      </h1>
                  </div>,
                  headerSlot,
              )
            : null;

    return (
        <main className="mx-auto w-full max-w-md px-4 pb-8 pt-[calc(1.25rem+var(--storefront-header-extension-height,0px))] sm:px-6 md:max-w-lg md:py-12">
            {titleBar}

            <div className="mb-8 hidden items-center gap-1 md:flex">
                <Link
                    href="/catalog"
                    aria-label="В каталог"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-admin-text"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                </Link>
                <h1 className="text-lg font-semibold text-admin-text">Заказ оформлен!</h1>
            </div>

            <div className="mx-auto mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden />
            </div>

            <p className="text-center text-xl font-semibold text-admin-text">Спасибо за заказ!</p>
            <p className="mt-2 text-center text-sm text-admin-text-secondary">Номер вашего заказа</p>
            {orderId ? (
                <p className="mt-1 text-center text-2xl font-bold tracking-tight text-admin-text">№ {orderId}</p>
            ) : null}

            {summary ? (
                <section className={`${siteCard} mt-6 px-4 py-3`}>
                    <div className="mb-1 flex items-center gap-2 border-b border-admin-border pb-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-admin-muted text-admin-text-secondary">
                            <UserRound className="h-4 w-4" aria-hidden />
                        </span>
                        <h2 className="text-sm font-semibold text-admin-text">Информация о заказе</h2>
                    </div>

                    <InfoRow
                        icon={<Package className="h-4 w-4" aria-hidden />}
                        label="Товары"
                        value={`${summary.itemsQty} шт.`}
                    />
                    <InfoRow
                        icon={<Wallet className="h-4 w-4" aria-hidden />}
                        label="Сумма"
                        value={formatMoneyRub(formatMoneyMinorUnits(sumMinor))}
                    />
                    {waitingMinor > 0 ? (
                        <InfoRow
                            icon={<BadgePercent className="h-4 w-4" aria-hidden />}
                            label="Скидка 3%"
                            value={<span>−{formatMoneyRub(formatMoneyMinorUnits(waitingMinor))}</span>}
                            valueClassName="font-medium text-rose-600"
                        />
                    ) : null}
                    {loyaltyMinor > 0 ? (
                        <InfoRow
                            icon={<BadgePercent className="h-4 w-4" aria-hidden />}
                            label={loyaltyPercent ? `Скидка по карте ${loyaltyPercent}%` : "Скидка по карте"}
                            value={<span>−{formatMoneyRub(formatMoneyMinorUnits(loyaltyMinor))}</span>}
                            valueClassName="font-medium text-rose-600"
                        />
                    ) : null}
                    {giftMinor > 0 ? (
                        <InfoRow
                            icon={<Wallet className="h-4 w-4" aria-hidden />}
                            label="Сертификат"
                            value={<span>−{formatMoneyRub(formatMoneyMinorUnits(giftMinor))}</span>}
                            valueClassName="font-medium text-rose-600"
                        />
                    ) : null}
                    <InfoRow
                        icon={<Truck className="h-4 w-4" aria-hidden />}
                        label="Доставка"
                        value={
                            deliveryMinor < 1 ? (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                    Бесплатно
                                </span>
                            ) : (
                                formatMoneyRub(summary.deliveryFee)
                            )
                        }
                    />

                    <div className="mt-1 flex items-center gap-3 border-t border-admin-border py-3">
                        <span className="text-base font-semibold text-admin-text">Итого</span>
                        <span className="ml-auto text-base font-semibold tabular-nums text-admin-text">
                            {formatMoneyRub(summary.total)}
                        </span>
                    </div>
                </section>
            ) : null}

            <p className="mx-auto mt-4 max-w-xs text-center text-sm leading-relaxed text-admin-text-secondary">
                Мы свяжемся с вами в ближайшее время для подтверждения заказа.
            </p>

            <Link href="/catalog" className={`${siteBtnPrimary} mt-6 h-12 w-full text-base`}>
                Вернуться в каталог
            </Link>
        </main>
    );
}
