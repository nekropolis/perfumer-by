"use client";

import type { OrderData } from "@/types/orders";
import { formatMoneyRub } from "@/lib/format-money-display";
import { formatDiscountPercentSnapshot } from "@/lib/loyalty-pricing";

function parseMoney(s: string | undefined | null): number {
    if (s == null || s === "") return 0;
    const n = Number.parseFloat(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

export default function OrderDiscountSummary({ order }: { order: OrderData }) {
    const sub = parseMoney(order.subtotal);
    const tot = parseMoney(order.total);
    const cardAmt = parseMoney(order.discount_amount);
    const certAmt = parseMoney(order.gift_certificate_amount);
    const cardNo = order.discount_card_number?.trim();
    const pctLabel = formatDiscountPercentSnapshot(order.discount_percent_snapshot);
    const hasCard = cardAmt > 0;
    const certLabel = order.gift_certificate_code || order.gift_certificate_number;
    const hasCert = Boolean(certLabel) && certAmt > 0;
    const savings = Math.max(0, sub - tot);

    if (!hasCard && !hasCert && savings < 0.004) {
        return null;
    }

    return (
        <div className="mt-6 space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Сумма товаров со скидкой</span>
                <span>{formatMoneyRub(order.subtotal)}</span>
            </div>
            {hasCard ? (
                <div className="flex justify-between text-green-800">
                    <span>
                        {cardNo ? (
                            <>
                                Карта{" "}
                                <span className="font-mono font-medium">{cardNo}</span>
                                {pctLabel ? <span> ({pctLabel}%)</span> : null}
                            </>
                        ) : (
                            <>
                                Карта лояльности
                                {pctLabel ? <span> ({pctLabel}%)</span> : null}
                            </>
                        )}
                    </span>
                    <span>−{formatMoneyRub(order.discount_amount)}</span>
                </div>
            ) : null}
            {hasCert ? (
                <div className="flex justify-between text-green-800">
                    <span>Сертификат {certLabel}</span>
                    <span>−{formatMoneyRub(order.gift_certificate_amount)}</span>
                </div>
            ) : null}
            {savings > 0.004 ? (
                <div className="flex justify-between border-t border-[var(--line)] pt-2 text-xs text-[var(--foreground)]">
                    <span>Выгода</span>
                    <span className="font-semibold text-green-700">{formatMoneyRub(savings)}</span>
                </div>
            ) : null}
        </div>
    );
}
