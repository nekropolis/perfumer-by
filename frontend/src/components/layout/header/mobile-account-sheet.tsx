"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AuthUserProfile } from "@/lib/auth-api";
import { formatBelarusPhoneSpaced } from "@/lib/site-contact";
import { useSheetPresence } from "@/components/layout/header/use-sheet-presence";
import { siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

const tileClass =
    "flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-admin-border bg-admin-muted/50 px-3 py-3 text-center text-sm font-medium text-admin-text transition hover:bg-admin-muted active:scale-[0.98]";

type Props = {
    open: boolean;
    isAuthenticated: boolean;
    user: AuthUserProfile | null;
    onCloseAction: () => void;
    onLogoutAction: () => void;
};

function profileName(user: AuthUserProfile | null): string {
    const fromParts = [user?.first_name, user?.patronymic, user?.last_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");

    return fromParts || user?.name?.trim() || "Пользователь";
}

export default function MobileAccountSheet({
    open,
    isAuthenticated,
    user,
    onCloseAction,
    onLogoutAction,
}: Props) {
    const { mounted, sheetState, onTransitionEnd } = useSheetPresence(open);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [mounted]);

    if (!mounted || typeof document === "undefined") {
        return null;
    }

    const phone = user?.phone?.trim() ? formatBelarusPhoneSpaced(user.phone) : "";
    const email = user?.email?.trim() ?? "";

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Профиль"
            data-state={sheetState}
            onTransitionEnd={onTransitionEnd}
            className="storefront-sheet fixed inset-x-0 z-[145] flex flex-col bg-admin-surface md:hidden"
            style={{
                top: "var(--storefront-header-row-height, 52px)",
                bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px) + var(--storefront-keyboard-toolbar, 0px))",
            }}
        >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                <section className={`${siteCard} p-3`}>
                    <Link
                        href="/wishlist"
                        className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-admin-border bg-admin-muted/50 px-3 text-sm font-medium text-admin-text transition hover:bg-admin-muted active:scale-[0.98]"
                        onClick={onCloseAction}
                    >
                        <Heart className="h-5 w-5 shrink-0" aria-hidden />
                        Избранное
                    </Link>
                    {isAuthenticated ? (
                        <div className="px-2 pb-3 pt-1">
                            <div className="text-base font-semibold text-admin-text">{profileName(user)}</div>
                            {phone ? <div className="mt-1 text-sm text-admin-text-secondary">{phone}</div> : null}
                            {email ? <div className="mt-1 truncate text-sm text-admin-text-secondary">{email}</div> : null}
                        </div>
                    ) : (
                        <div className="px-2 pb-3 pt-1">
                            <div className="text-base font-semibold text-admin-text">Гость</div>
                            <p className="mt-1 text-sm text-admin-text-secondary">Войдите, чтобы открыть профиль</p>
                        </div>
                    )}
                    <nav className="grid grid-cols-2 gap-2" aria-label="Профиль">
                        {isAuthenticated ? (
                            <Link href="/account" className={tileClass} onClick={onCloseAction}>
                                Личный кабинет
                            </Link>
                        ) : (
                            <Link href="/login" className={tileClass} onClick={onCloseAction}>
                                Войти
                            </Link>
                        )}
                        {isAuthenticated ? (
                            <button
                                type="button"
                                className={tileClass}
                                onClick={() => {
                                    onLogoutAction();
                                    onCloseAction();
                                }}
                            >
                                Выйти
                            </button>
                        ) : (
                            <Link href="/login?tab=register" className={tileClass} onClick={onCloseAction}>
                                Регистрация
                            </Link>
                        )}
                    </nav>
                </section>
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
