"use client";

import Link from "next/link";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import AccountMoreLinks from "@/components/account/account-more-links";
import { siteBtnSecondary, siteMenuRow } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    isAuthenticated: boolean;
    userName: string;
    onCloseAction: () => void;
    onLogoutAction: () => void;
};

export default function MobileProfileSheet({
    open,
    isAuthenticated,
    userName,
    onCloseAction,
    onLogoutAction,
}: Props) {
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
            className="fixed inset-x-0 z-[135] flex flex-col bg-admin-surface md:hidden"
            style={{
                top: "var(--catalog-toolbar-sticky-top, 64px)",
                bottom: "var(--storefront-tab-bar-height, 0px)",
            }}
        >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                    Меню
                </div>
                {isAuthenticated ? (
                    <div className="mb-2">
                        <div className="px-3 py-1 text-sm font-medium text-admin-text">{userName}</div>
                        <Link href="/account" className={siteMenuRow} onClick={onCloseAction}>
                            Личный кабинет
                        </Link>
                        <button
                            type="button"
                            className={siteMenuRow}
                            onClick={() => {
                                onLogoutAction();
                                onCloseAction();
                            }}
                        >
                            Выйти
                        </button>
                    </div>
                ) : (
                    <Link href="/login" className={`${siteMenuRow} mb-2`} onClick={onCloseAction}>
                        Войти
                    </Link>
                )}
                <AccountMoreLinks onNavigateAction={onCloseAction} />
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
