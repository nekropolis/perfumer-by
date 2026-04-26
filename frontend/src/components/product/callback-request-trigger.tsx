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

export default function CallbackRequestTrigger({
    productId,
    productName,
    variantId,
    variantTitle,
    label = "Заказать звонок",
    className = "inline-flex items-center gap-1.5 text-sm text-emerald-700",
}: Props) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title={label}
                aria-label={label}
                style={{ transition: "transform 200ms ease-out" }}
                onMouseEnter={(event) => {
                    event.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "scale(1)";
                }}
                className={className}
            >
                <PhoneCall className="h-4 w-4" />
                <span className="underline underline-offset-4 decoration-emerald-300">
                    {label}
                </span>
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
