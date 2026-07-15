"use client";

import Link from "next/link";
import { User } from "lucide-react";
import type { RefObject } from "react";

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
                        <span className="max-w-[120px] truncate">{userName}</span>
                    </button>

                    {isAccountOpen && (
                        <div className="absolute right-0 mt-3 w-72 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_16px_40px_rgba(31,23,34,0.08)]">
                            <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                    {userName}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {userPhone}
                                </div>
                            </div>

                            <div className="my-2 border-t border-[var(--line)]" />

                            <Link
                                href="/account"
                                className="block rounded-2xl px-4 py-3 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <Link
                                href="/wishlist"
                                className="block rounded-2xl px-4 py-3 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onCloseAction}
                            >
                                Избранное
                            </Link>

                            <button
                                type="button"
                                className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
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