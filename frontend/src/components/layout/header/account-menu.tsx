"use client";

import Link from "next/link";
import { User } from "lucide-react";
import type { RefObject } from "react";
import { siteBtnGhost } from "@/lib/site-ui-classes";

type Props = {
    accountRef: RefObject<HTMLDivElement | null>;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    onToggleAction: () => void;
    onCloseAction: () => void;
    onLogoutAction: () => void;
};

export default function HeaderAccountMenu({
    accountRef,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    onToggleAction,
    onCloseAction,
    onLogoutAction,
}: Props) {
    return (
        <div className="relative hidden md:block" ref={accountRef}>
            {isAuthenticated ? (
                <div className="relative">
                    <button
                        type="button"
                        className="inline-flex h-11 items-center gap-2 rounded-2xl px-2 text-sm font-medium text-[var(--header-text)] transition hover:bg-[var(--header-control-bg)]"
                        onClick={onToggleAction}
                    >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--header-control-bg)] text-[10px] font-semibold text-[var(--header-text)]">
                            {userName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="hidden max-w-[120px] truncate lg:inline">{userName}</span>
                    </button>

                    {isAccountOpen && (
                        <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-56 rounded-xl border border-admin-border bg-admin-surface p-1.5 shadow-xl">
                            <div className="px-3 py-2">
                                <div className="text-sm font-medium text-admin-text">{userName}</div>
                                <div className="mt-0.5 text-xs text-admin-text-secondary">{userPhone}</div>
                            </div>

                            <div className="my-1 h-px bg-admin-border" aria-hidden />

                            <Link
                                href="/account"
                                className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm`}
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <Link
                                href="/wishlist"
                                className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm`}
                                onClick={onCloseAction}
                            >
                                Избранное
                            </Link>

                            <button
                                type="button"
                                className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm`}
                                onClick={onLogoutAction}
                            >
                                Выйти
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <Link
                    href="/login"
                    className="inline-flex h-11 items-center gap-2 rounded-2xl px-2 text-sm font-medium text-[var(--header-text-secondary)] transition hover:bg-[var(--header-control-bg)] hover:text-[var(--header-text)]"
                >
                    <User className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Войти</span>
                </Link>
            )}
        </div>
    );
}