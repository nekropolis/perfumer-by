"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";
import CallbackRequestModal from "@/components/product/callback-request-modal";

type Props = {
    productId?: number | null;
    productName?: string | null;
    variantId?: number | null;
    variantTitle?: string | null;
    label?: string;
    className?: string;
};

const defaultLinkClass =
    "inline-flex items-center gap-2.5 text-base font-medium text-admin-text transition duration-200 ease-out hover:scale-110 hover:text-admin-primary";

export default function CallbackRequestTrigger({
    productId,
    productName,
    variantId,
    variantTitle,
    label = "Заказать звонок",
    className = defaultLinkClass,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title={label}
                aria-label={label}
                className={className}
            >
                <PhoneCall className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="underline underline-offset-4 decoration-admin-border-strong">{label}</span>
            </button>

            <CallbackRequestModal
                open={isOpen}
                onCloseAction={() => setIsOpen(false)}
                productId={productId}
                productName={productName}
                variantId={variantId}
                variantTitle={variantTitle}
            />
        </>
    );
}
