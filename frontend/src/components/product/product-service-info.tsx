"use client";

import { CreditCard, Phone, Truck } from "lucide-react";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import SitePhoneDropdown from "@/components/ui/site-phone-dropdown";
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    productId?: number;
    productName?: string;
    variantId?: number | null;
    variantTitle?: string | null;
};

export default function ProductServiceInfo({
    productId,
    productName,
    variantId,
    variantTitle,
}: Props) {
    return (
        <div className={`${siteCard} p-4 sm:p-5`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-admin-border bg-admin-muted/40 p-4">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <Truck size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-medium">Доставка</div>
                    </div>

                    <ul className="space-y-1 text-sm text-admin-text-secondary">
                        <li>Белпочтой</li>
                        <li>Европочтой до отделения</li>
                        <li>Курьером по РБ</li>
                    </ul>
                </div>

                <div className="rounded-xl border border-admin-border bg-admin-muted/40 p-4">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <CreditCard size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-medium">Оплата</div>
                    </div>

                    <ul className="space-y-1 text-sm text-admin-text-secondary">
                        <li>Наличными курьеру</li>
                        <li>Наложенным платежом</li>
                        <li>Банковской картой онлайн</li>
                    </ul>
                </div>

                <div className="rounded-xl border border-admin-border bg-admin-muted/40 p-4">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <Phone size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-medium">Нужна помощь?</div>
                    </div>

                    <SitePhoneDropdown size="lg" />

                    <div className="mt-4">
                        <CallbackRequestTrigger
                            productId={productId}
                            productName={productName}
                            variantId={variantId}
                            variantTitle={variantTitle}
                            label="Мы Вам перезвоним"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
