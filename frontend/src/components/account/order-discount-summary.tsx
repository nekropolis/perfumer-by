"use client";

import type { OrderData } from "@/types/orders";

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
    const pct = order.discount_percent_snapshot?.trim();
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
                <span>{order.subtotal} руб.</span>
            </div>
            {hasCard ? (
                <div className="flex justify-between text-green-800">
                    <span>
                        Карта{" "}
                        <span className="font-mono font-medium">
                            {cardNo && cardNo !== "" ? cardNo : "удалена"}
                        </span>
                        {pct ? <span> ({pct}%)</span> : null}
                    </span>
                    <span>−{order.discount_amount} руб.</span>
                </div>
            ) : null}
            {hasCert ? (
                <div className="flex justify-between text-green-800">
                    <span>Сертификат {certLabel}</span>
                    <span>−{order.gift_certificate_amount} руб.</span>
                </div>
            ) : null}
            {savings > 0.004 ? (
                <div className="flex justify-between border-t border-[var(--line)] pt-2 text-xs text-[var(--foreground)]">
                    <span>Выгода</span>
                    <span className="font-semibold text-green-700">{savings.toFixed(2)} руб.</span>
                </div>
            ) : null}
        </div>
    );
}
