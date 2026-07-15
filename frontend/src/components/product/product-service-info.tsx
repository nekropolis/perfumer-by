"use client";

import { CreditCard, Phone, Truck } from "lucide-react";
import { useSiteContent } from "@/components/layout/site-content-context";
import { phoneNationalShortSuffix } from "@/lib/site-contact";

export default function ProductServiceInfo() {
    const siteContent = useSiteContent();
    const phoneShortLabel = phoneNationalShortSuffix(siteContent.contact_phone_mts) || "640-88-33";
    const phoneHref = siteContent.contact_phone_mts
        ? `tel:${String(siteContent.contact_phone_mts).replace(/\D/g, "")}`
        : undefined;

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <Truck size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Доставка</div>
                </div>

                <ul className="space-y-1 text-sm text-admin-text-secondary">
                    <li>Белпочтой</li>
                    <li>Европочтой</li>
                    <li>Курьером по РБ</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <CreditCard size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Оплата</div>
                </div>

                <ul className="space-y-1 text-sm text-admin-text-secondary">
                    <li>Курьеру</li>
                    <li>Наложенный платёж</li>
                    <li>Картой онлайн</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-admin-text">
                    <Phone size={16} strokeWidth={1.75} aria-hidden />
                    <div className="text-sm font-semibold">Помощь</div>
                </div>

                <ul className="space-y-1 text-sm text-admin-text-secondary">
                    <li>
                        {phoneHref ? (
                            <a href={phoneHref} className="transition hover:text-admin-text">
                                {phoneShortLabel}
                            </a>
                        ) : (
                            phoneShortLabel
                        )}
                    </li>
                    <li>MTC / A1 / life</li>
                </ul>
            </div>
        </div>
    );
}
