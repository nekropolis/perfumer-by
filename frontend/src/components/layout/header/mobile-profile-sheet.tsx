"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import AccountMoreLinks from "@/components/account/account-more-links";
import { siteBtnSecondary } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    onCloseAction: () => void;
};

export default function MobileProfileSheet({ open, onCloseAction }: Props) {
    useEffect(() => {
        if (!open) {
            return;
        }

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    if (!open || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Меню"
            className="fixed inset-x-0 z-[145] flex flex-col bg-admin-surface md:hidden"
            style={{
                top: "var(--storefront-header-row-height, 52px)",
                bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
            }}
        >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                <AccountMoreLinks showContacts onNavigateAction={onCloseAction} />
            </div>
            <div className="shrink-0 border-t border-admin-border px-3 py-3">
                <button type="button" className={`${siteBtnSecondary} min-h-12 w-full`} onClick={onCloseAction}>
                    Закрыть
                </button>
            </div>
        </div>,
        document.body,
    );
}
