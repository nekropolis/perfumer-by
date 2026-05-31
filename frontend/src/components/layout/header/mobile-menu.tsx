"use client";

import Link from "next/link";
import { type RefObject } from "react";
import { createPortal } from "react-dom";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";

type Props = {
    isOpen: boolean;
    topOffset: number;
    wishlistQty: number;
    contactLinks?: ReadonlyArray<{ label: string; href: string }>;
    phoneLinks?: ReadonlyArray<{ label: string; number: string }>;
    isAuthenticated: boolean;
    userName: string;
    userPhone: string;
    onCloseAction: () => void;
    onLogoutAction: () => void;
    /** Root of portaled menu — parent uses this to ignore “click outside” for desktop search ref. */
    menuRootRef?: RefObject<HTMLDivElement | null>;
};

export default function HeaderMobileMenu({
    isOpen,
    topOffset,
    wishlistQty,
    phoneLinks = [],
    contactLinks = [],
    isAuthenticated,
    userName,
    userPhone,
    onCloseAction,
    onLogoutAction,
    menuRootRef,
}: Props) {
    if (!isOpen || typeof window === "undefined") {
        return null;
    }

    const getOperatorBadgeClass = (label: string) => {
        const normalized = label.toLowerCase();
        if (normalized.includes("мтс")) {
            return "bg-red-50 text-red-700 border-red-200";
        }
        if (normalized.includes("life")) {
            return "bg-amber-50 text-amber-700 border-amber-200";
        }
        return "bg-violet-50 text-violet-700 border-violet-200";
    };

    return createPortal(
        <div
            ref={menuRootRef}
            className="fixed inset-x-0 bottom-0 z-50 overflow-x-clip border-t border-[var(--line)] bg-[var(--surface)] md:hidden"
            style={{ top: `${topOffset}px` }}
        >
            <div className="h-full overflow-y-auto overscroll-contain">
                <div className="mx-auto max-w-7xl px-4 py-4 pb-6 sm:px-6">
                    <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            href="/catalog"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Каталог
                        </Link>

                        <Link
                            href="/brands"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Бренды
                        </Link>

                        <Link
                            href="/wishlist"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            <span className="inline-flex items-center gap-2">
                                Избранное
                                {wishlistQty > 0 ? (
                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-[var(--background)]">
                                        {wishlistQty}
                                    </span>
                                ) : null}
                            </span>
                        </Link>

                        <Link
                            href="/catalog?sort=new"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Новинки
                        </Link>

                        <Link
                            href="/catalog?sale=1"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Акции
                        </Link>

                        <Link
                            href="/reviews"
                            className="col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Отзывы о магазине
                        </Link>

                        <Link
                            href="/news"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Новости
                        </Link>

                        <Link
                            href="/articles"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Статьи
                        </Link>
                    </div>

                    {isAuthenticated ? (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-2">
                            <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                    {userName}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {userPhone}
                                </div>
                            </div>

                            <Link
                                href="/account"
                                className="mt-2 block rounded-2xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <button
                                type="button"
                                className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onLogoutAction}
                            >
                                Выйти
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-2">
                            <Link
                                href="/login"
                                className="block rounded-2xl px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] hover:text-[var(--accent)]"
                                onClick={onCloseAction}
                            >
                                Войти
                            </Link>
                        </div>
                    )}

                    {contactLinks.length > 0 ? (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                Связаться с нами
                            </div>

                            <div className="flex flex-col gap-1">
                                {phoneLinks.map((phone) => (
                                    <a
                                        key={phone.number}
                                        href={`tel:${phone.number}`}
                                        className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)]"
                                    >
                                        <span
                                            className={`inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getOperatorBadgeClass(phone.label)}`}
                                        >
                                            {phone.label}
                                        </span>
                                        <span className="font-medium">{phone.number}</span>
                                    </a>
                                ))}

                                {contactLinks.map((item) => (
                                    <a
                                        key={item.href}
                                        href={item.href}
                                        className="rounded-2xl px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                    >
                                        {item.label}
                                    </a>
                                ))}

                                <div className="pt-1">
                                    <CallbackRequestTrigger className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--background)]" />
                                </div>
                            </div>
                        </div>
                    ) : null}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}