"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import OneClickOrderModal from "@/components/product/one-click-order-modal";

type Props = {
    productId: number;
    productName: string;
    variantId?: number | null;
    variantTitle?: string | null;
    label?: string;
    className?: string;
    disabled?: boolean;
};

const defaultLinkClass =
    "inline-flex items-center gap-2.5 text-base font-medium text-admin-text transition duration-200 ease-out hover:scale-110 hover:text-admin-primary disabled:pointer-events-none disabled:opacity-50";

export default function OneClickOrderTrigger({
    productId,
    productName,
    variantId = null,
    variantTitle,
    label = "Купить в один клик",
    className = defaultLinkClass,
    disabled = false,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title={label}
                aria-label={label}
                disabled={disabled || variantId === null}
                className={className}
            >
                <MousePointerClick className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="underline underline-offset-4 decoration-admin-border-strong">{label}</span>
            </button>

            <OneClickOrderModal
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
