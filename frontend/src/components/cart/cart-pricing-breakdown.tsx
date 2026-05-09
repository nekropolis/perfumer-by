"use client";

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
    /** Стоимость доставки (строка с руб.); если «0.00» — покажем «Бесплатно» */
    deliveryFee?: string | null;
    /** Итог к оплате с учётом доставки; если не задан — используется `total` */
    grandTotal?: string | null;
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
    className = "",
}: Props) {
    const sub = parseMoney(subtotal);
    const tot = parseMoney(total);
    const cardAmt = discountCard ? parseMoney(discountCard.discount_amount) : 0;
    const certAmt = giftCertificate ? parseMoney(giftCertificate.amount) : 0;
    const savings = Math.max(0, sub - tot);
    const hasCard = discountCard && cardAmt > 0;
    const hasCert = giftCertificate && certAmt > 0;

    return (
        <div className={`space-y-2 text-sm text-[var(--text-secondary)] ${className}`}>
            {itemsQty !== undefined ? (
                <div className="flex items-center justify-between">
                    <span>Товаров</span>
                    <span className="text-[var(--foreground)]">{itemsQty}</span>
                </div>
            ) : null}

            <div className="flex items-center justify-between">
                <span>Сумма товаров</span>
                <span className="text-[var(--foreground)]">{subtotal} руб.</span>
            </div>

            {hasCard ? (
                <div className="flex flex-col gap-0.5 rounded-xl border border-green-200/60 bg-green-50/40 px-3 py-2 text-green-900">
                    <div className="flex items-center justify-between gap-2">
                        <span>
                            Скидка по карте <span className="font-mono font-medium">{discountCard!.number}</span>
                            <span className="text-green-800/90"> ({discountCard!.discount_percent}%)</span>
                        </span>
                        <span className="shrink-0 font-medium">−{discountCard!.discount_amount} руб.</span>
                    </div>
                </div>
            ) : null}

            {hasCert ? (
                <div className="flex items-center justify-between text-green-800">
                    <span>Сертификат {giftCertificate!.code || giftCertificate!.number}</span>
                    <span className="font-medium">−{giftCertificate!.amount} руб.</span>
                </div>
            ) : null}

            {savings > 0.004 ? (
                <div className="flex items-center justify-between rounded-lg bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]">
                    <span>Выгода по скидкам</span>
                    <span className="font-semibold text-green-700">{savings.toFixed(2)} руб.</span>
                </div>
            ) : null}

            {deliveryFee != null ? (
                <div className="flex items-center justify-between">
                    <span>Доставка</span>
                    <span>
                        {parseMoney(deliveryFee) < 0.005 ? (
                            <span className="text-green-700">Бесплатно</span>
                        ) : (
                            <span>{deliveryFee} руб.</span>
                        )}
                    </span>
                </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-[var(--line)] pt-3 text-base font-semibold text-[var(--foreground)]">
                <span>К оплате</span>
                <span>{grandTotal && grandTotal.trim() !== "" ? `${grandTotal} руб.` : `${total} руб.`}</span>
            </div>
        </div>
    );
}
