"use client";

import { CreditCard, Phone, Truck } from "lucide-react";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import { useSiteContent } from "@/components/layout/site-content-context";
import { formatBelarusDisplay, phoneNationalShortSuffix, telHref } from "@/lib/site-contact";

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
    const site = useSiteContent();
    const short = phoneNationalShortSuffix(site.contact_phone_mts) || "640-88-33";
    const primaryTel = telHref(site.contact_phone_mts);
    const primaryDisplay = formatBelarusDisplay(site.contact_phone_mts);

    return (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--background)] p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Truck size={16} />
                        <div className="text-sm font-medium">Доставка</div>
                    </div>

                    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                        <li>Белпочтой</li>
                        <li>Европочтой до отделения</li>
                        <li>Курьером по РБ</li>
                    </ul>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <CreditCard size={16} />
                        <div className="text-sm font-medium">Оплата</div>
                    </div>

                    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                        <li>Наличными курьеру</li>
                        <li>Наложенным платежом</li>
                        <li>Банковской картой онлайн</li>
                    </ul>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Phone size={16} />
                        <div className="text-sm font-medium">Нужна помощь?</div>
                    </div>

                    <div className="text-sm text-[var(--text-secondary)]">МТС / A1 / life</div>
                    <a
                        href={primaryTel}
                        className="mt-2 block text-2xl font-semibold tracking-tight text-[var(--foreground)] hover:underline"
                    >
                        {short}
                    </a>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{primaryDisplay}</p>

                    <div className="mt-3">
                        <CallbackRequestTrigger
                            productId={productId}
                            productName={productName}
                            variantId={variantId}
                            variantTitle={variantTitle}
                            label="Мы Вам перезвоним"
                            className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground)] underline underline-offset-4 hover:no-underline"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
