"use client";

import Link from "next/link";
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
                        className="inline-flex items-center gap-1.5 rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                        onClick={onToggleAction}
                    >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-black">
                            {userName.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{userName}</span>
                    </button>

                    {isAccountOpen && (
                        <div className="absolute right-0 mt-2 w-64 rounded-3xl border bg-white p-2 shadow-lg">
                            <div className="px-3 py-3">
                                <div className="text-sm font-medium text-black">{userName}</div>
                                <div className="mt-1 text-xs text-gray-500">{userPhone}</div>
                            </div>

                            <div className="my-1 border-t" />

                            <Link
                                href="/account"
                                className="block rounded-2xl px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <button
                                type="button"
                                className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-black"
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
                    className="inline-flex items-center rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                >
                    Войти
                </Link>
            )}
        </div>
    );
}
