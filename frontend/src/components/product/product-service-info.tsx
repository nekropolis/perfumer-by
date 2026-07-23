"use client";

import { CreditCard, Phone, Truck } from "lucide-react";
import SitePhoneDropdown from "@/components/ui/site-phone-dropdown";

export type ProductServiceDeliveryInfo = {
    minskFreeThreshold: number;
    belarusFee: number;
    belarusFreeMinLines: number;
};

type Props = {
    delivery?: ProductServiceDeliveryInfo;
};

function formatShortRub(value: number): string {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return "0р";
    }
    const rounded = Math.round(n * 100) / 100;
    if (Number.isInteger(rounded)) {
        return `${rounded}р`;
    }
    return `${rounded.toFixed(2).replace(".", ",")}р`;
}

export default function ProductServiceInfo({ delivery }: Props) {
    const minskThreshold = formatShortRub(delivery?.minskFreeThreshold ?? 50);
    const belarusFee = formatShortRub(delivery?.belarusFee ?? 6);
    const belarusFreeMinLines = Math.max(1, Math.floor(delivery?.belarusFreeMinLines ?? 2));

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <Truck size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Доставка</div>
                </div>

                <ul className="space-y-2.5 text-sm text-admin-text">
                    <li>
                        <div className="leading-snug">Курьером по Минску</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-admin-text-muted">
                            Бесплатно от {minskThreshold}
                        </div>
                    </li>
                    <li>
                        <div className="leading-snug">
                            Курьером по РБ
                            <span className="text-admin-text-secondary"> — {belarusFee}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] leading-snug text-admin-text-muted">
                            Бесплатно от {belarusFreeMinLines}{" "}
                            {belarusFreeMinLines === 1 ? "единицы" : "единиц"}
                        </div>
                    </li>
                </ul>
            </div>

            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <CreditCard size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Оплата</div>
                </div>

                <ul className="space-y-1 text-sm text-admin-text-secondary">
                    <li>Наличными курьеру</li>
                    <li>Банковский перевод (ЕРИП)</li>
                    <li>Картой при получении</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <Phone size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Есть вопросы?</div>
                </div>

                <SitePhoneDropdown size="plain" />
            </div>
        </div>
    );
}
