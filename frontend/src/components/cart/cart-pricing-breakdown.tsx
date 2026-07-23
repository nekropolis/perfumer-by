"use client";

import { formatMoneyDisplay, formatMoneyRub } from "@/lib/format-money-display";

type DiscountCardLine = {
    number: string;
    discount_percent: string;
    discount_amount: string;
    session_only?: boolean;
};

type GiftLine = {
    code?: string;
    number?: string;
    amount: string;
};

type Props = {
    itemsQty?: number;
    subtotal: string;
    total: string;
    discountCard: DiscountCardLine | null;
    giftCertificate: GiftLine | null;
    deliveryFee?: string | null;
    grandTotal?: string | null;
    waitingDiscountAmount?: string | null;
    /** Подарок при оплате наличными на чекауте */
    sampleGift?: boolean;
    className?: string;
};

function parseMoney(s: string): number {
    const n = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

export default function CartPricingBreakdown({
    itemsQty,
    subtotal,
    total,
    discountCard,
    giftCertificate,
    deliveryFee,
    grandTotal,
    waitingDiscountAmount,
    sampleGift = false,
    className = "",
}: Props) {
    const sub = parseMoney(subtotal);
    const tot = parseMoney(total);
    const cardAmt = discountCard ? parseMoney(discountCard.discount_amount) : 0;
    const certAmt = giftCertificate ? parseMoney(giftCertificate.amount) : 0;
    const waitingAmt = waitingDiscountAmount ? parseMoney(waitingDiscountAmount) : 0;
    const savings = Math.max(0, sub - tot);
    const hasCard = discountCard && cardAmt > 0;
    const hasCert = giftCertificate && certAmt > 0;
    const hasWaiting = waitingAmt > 0.004;

    return (
        <div className={`space-y-2 text-sm text-admin-text-secondary ${className}`}>
            {itemsQty !== undefined ? (
                <div className="flex items-center justify-between">
                    <span>Товаров</span>
                    <span className="text-admin-text">{itemsQty} шт.</span>
                </div>
            ) : null}

            <div className="flex items-center justify-between">
                <span>Сумма товаров</span>
                <span className="text-admin-text">{formatMoneyRub(subtotal)}</span>
            </div>

            {hasCard ? (
                <div className="flex flex-col gap-0.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                    <div className="flex items-center justify-between gap-2">
                        <span>
                            Скидка по карте <span className="font-mono font-medium">{discountCard!.number}</span>
                            <span className="text-emerald-700/90"> ({discountCard!.discount_percent}%)</span>
                        </span>
                        <span className="shrink-0 font-medium">
                            −{formatMoneyDisplay(discountCard!.discount_amount) ?? discountCard!.discount_amount} руб.
                        </span>
                    </div>
                </div>
            ) : null}

            {hasWaiting ? (
                <div className="flex items-center justify-between text-amber-700">
                    <span>Скидка 3% за ожидание доставки</span>
                    <span className="font-medium">
                        −{formatMoneyDisplay(waitingDiscountAmount!) ?? waitingDiscountAmount} руб.
                    </span>
                </div>
            ) : null}

            {hasCert ? (
                <div className="flex items-center justify-between text-emerald-700">
                    <span>Сертификат {giftCertificate!.code || giftCertificate!.number}</span>
                    <span className="font-medium">
                        −{formatMoneyDisplay(giftCertificate!.amount) ?? giftCertificate!.amount} руб.
                    </span>
                </div>
            ) : null}

            {savings > 0.004 ? (
                <div className="flex items-center justify-between rounded-lg bg-admin-muted px-2 py-1.5 text-xs text-admin-text">
                    <span>Выгода по скидкам</span>
                    <span className="font-semibold text-emerald-700">{formatMoneyRub(savings.toFixed(2))}</span>
                </div>
            ) : null}

            {deliveryFee != null ? (
                <div className="flex items-center justify-between">
                    <span>Доставка</span>
                    <span>
                        {parseMoney(deliveryFee) < 0.005 ? (
                            <span className="text-emerald-700">Бесплатно</span>
                        ) : (
                            <span>{formatMoneyRub(deliveryFee)}</span>
                        )}
                    </span>
                </div>
            ) : null}

            {sampleGift ? (
                <div className="flex items-center justify-between text-emerald-700">
                    <span>Пробник в подарок</span>
                    <span className="font-medium">Бесплатно</span>
                </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-admin-border pt-3 text-base font-semibold text-admin-text">
                <span>К оплате</span>
                <span>
                    {grandTotal && grandTotal.trim() !== "" ? formatMoneyRub(grandTotal) : formatMoneyRub(total)}
                </span>
            </div>
        </div>
    );
}
