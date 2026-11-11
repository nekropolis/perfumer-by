"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AccountMoreLinks, { MOBILE_MENU_IMAGE_SRCS } from "@/components/account/account-more-links";
import { siteBtnSecondary } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    onCloseAction: () => void;
};

export default function MobileProfileSheet({ open, onCloseAction }: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (window.matchMedia("(min-width: 768px)").matches) {
            return;
        }

        const links: HTMLLinkElement[] = [];
        for (const src of MOBILE_MENU_IMAGE_SRCS) {
            if (document.head.querySelector(`link[rel="preload"][as="image"][href="${src}"]`)) {
                continue;
            }
            const link = document.createElement("link");
            link.rel = "preload";
            link.as = "image";
            link.href = src;
            document.head.appendChild(link);
            links.push(link);
        }

        return () => {
            for (const link of links) {
                link.remove();
            }
        };
    }, []);

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

    if (!mounted) {
        return null;
    }

    return createPortal(
        <div
            role="dialog"
            aria-modal={open ? true : undefined}
            aria-label="Меню"
            aria-hidden={!open}
            // Держим смонтированным: CSS-фоны плиток грузятся заранее, без вспышки при открытии.
            className={`fixed inset-x-0 z-[145] flex flex-col bg-admin-bg md:hidden ${
                open ? "visible" : "invisible pointer-events-none"
            }`}
            style={{
                top: "var(--storefront-header-row-height, 52px)",
                bottom: "var(--storefront-keyboard-inset, 0px)",
                paddingBottom: "calc(var(--storefront-tab-bar-height, 0px) + 1px)",
            }}
        >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                <AccountMoreLinks showContacts onNavigateAction={onCloseAction} />
            </div>
            <div className="shrink-0 border-t border-admin-border bg-admin-bg px-3 py-3">
                <button type="button" className={`${siteBtnSecondary} min-h-12 w-full`} onClick={onCloseAction} tabIndex={open ? 0 : -1}>
                    Закрыть
                </button>
            </div>
        </div>,
        document.body,
    );
}
