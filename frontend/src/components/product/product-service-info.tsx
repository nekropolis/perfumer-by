"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, CreditCard, MessageCircleQuestion, Truck } from "lucide-react";
import SitePhoneDropdown from "@/components/ui/site-phone-dropdown";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";

export type ProductServiceDeliveryInfo = {
    minskFreeThreshold: number;
    belarusFee: number;
    belarusFreeMinLines: number;
};

type Props = {
    delivery?: ProductServiceDeliveryInfo;
};

type SectionKey = "delivery" | "payment" | "questions";

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

function ServiceAccordionItem({
    sectionKey,
    title,
    icon,
    open,
    onToggle,
    children,
}: {
    sectionKey: SectionKey;
    title: string;
    icon: ReactNode;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    const panelId = `product-service-panel-${sectionKey}`;
    const buttonId = `product-service-button-${sectionKey}`;

    return (
        <div className="overflow-hidden rounded-2xl border border-admin-border bg-admin-surface">
            <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-admin-muted/40"
            >
                <span className="flex min-w-0 items-center gap-2 text-admin-text">
                    {icon}
                    <span className="text-sm font-semibold">{title}</span>
                </span>
                <ChevronDown
                    className={`h-5 w-5 shrink-0 text-admin-text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>
            <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
                <div className="overflow-hidden">
                    <div className="border-t border-admin-border px-4 pb-4 pt-3">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default function ProductServiceInfo({ delivery }: Props) {
    const minskThreshold = formatShortRub(delivery?.minskFreeThreshold ?? 50);
    const belarusFee = formatShortRub(delivery?.belarusFee ?? 6);
    const belarusFreeMinLines = Math.max(1, Math.floor(delivery?.belarusFreeMinLines ?? 2));
    const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
        delivery: false,
        payment: false,
        questions: false,
    });

    const toggleSection = (key: SectionKey) => {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const deliveryBody = (
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
    );

    const paymentBody = (
        <ul className="space-y-1 text-sm text-admin-text-secondary">
            <li>Наличными курьеру</li>
            <li>Банковский перевод (ЕРИП)</li>
            <li>Картой при получении</li>
        </ul>
    );

    const questionsBody = (
        <>
            <SitePhoneDropdown size="plain" />
            <div className="mt-2">
                <CallbackRequestTrigger
                    label="Заказать звонок"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-admin-text-secondary transition hover:text-admin-text"
                    iconClassName="h-3.5 w-3.5 shrink-0"
                />
            </div>
        </>
    );

    return (
        <>
            <div className="space-y-2 md:hidden">
                <ServiceAccordionItem
                    sectionKey="delivery"
                    title="Доставка"
                    icon={<Truck size={16} strokeWidth={1.75} aria-hidden />}
                    open={openSections.delivery}
                    onToggle={() => toggleSection("delivery")}
                >
                    {deliveryBody}
                </ServiceAccordionItem>
                <ServiceAccordionItem
                    sectionKey="payment"
                    title="Оплата"
                    icon={<CreditCard size={16} strokeWidth={1.75} aria-hidden />}
                    open={openSections.payment}
                    onToggle={() => toggleSection("payment")}
                >
                    {paymentBody}
                </ServiceAccordionItem>
                <ServiceAccordionItem
                    sectionKey="questions"
                    title="Есть вопросы?"
                    icon={<MessageCircleQuestion size={16} strokeWidth={1.75} aria-hidden />}
                    open={openSections.questions}
                    onToggle={() => toggleSection("questions")}
                >
                    {questionsBody}
                </ServiceAccordionItem>
            </div>

            <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-3">
                <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <Truck size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-semibold">Доставка</div>
                    </div>
                    {deliveryBody}
                </div>

                <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <CreditCard size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-semibold">Оплата</div>
                    </div>
                    {paymentBody}
                </div>

                <div className="rounded-2xl border border-admin-border bg-admin-surface p-5 sm:p-6">
                    <div className="mb-3 flex items-center gap-2 text-admin-text">
                        <MessageCircleQuestion size={16} strokeWidth={1.75} aria-hidden />
                        <div className="text-sm font-semibold">Есть вопросы?</div>
                    </div>
                    {questionsBody}
                </div>
            </div>
        </>
    );
}
