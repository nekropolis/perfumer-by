"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type RefObject } from "react";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import { siteBtnPrimary, siteCard, siteMenuRow } from "@/lib/site-ui-classes";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type Props = {
    isOpen: boolean;
    anchorBottom: number;
    wishlistQty: number;
    burgerLinks: ReadonlyArray<{ label: string; href: string }>;
    contactLinks?: ReadonlyArray<{ label: string; href: string }>;
    phoneLinks?: ReadonlyArray<{ label: string; number: string }>;
    isAuthenticated: boolean;
    userName: string;
    userPhone: string;
    onCloseAction: () => void;
    onLogoutAction: () => void;
    menuRootRef?: RefObject<HTMLDivElement | null>;
};

const ROOT_LINKS = [
    { label: "Каталог", href: "/catalog" },
    { label: "Новинки", href: "/catalog?new=1" },
    { label: "Хиты", href: "/catalog?hit=1" },
    { label: "Бренды", href: "/brands" },
    { label: "Избранное", href: "/wishlist", badgeKey: "wishlist" as const },
] as const;

export default function HeaderMobileMenu({
    isOpen,
    anchorBottom,
    wishlistQty,
    burgerLinks,
    phoneLinks = [],
    contactLinks = [],
    isAuthenticated,
    userName,
    userPhone,
    onCloseAction,
    onLogoutAction,
    menuRootRef,
}: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    if (!isOpen) {
        return null;
    }

    const handleClose = () => {
        onCloseAction();
    };

    const handleNavigate = () => {
        onCloseAction();
    };

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

    return (
        <div
            ref={menuRootRef}
            className="fixed inset-x-0 bottom-0 z-[130] flex flex-col overflow-hidden bg-admin-surface md:hidden"
            style={{ top: `${anchorBottom || 64}px` }}
        >
            <div className="flex shrink-0 items-center gap-2 border-b border-admin-border px-4 py-3">
                <h2 className="min-w-0 flex-1 text-base font-semibold text-admin-text">Меню</h2>
                <button
                    type="button"
                    onClick={handleClose}
                    className="text-sm font-medium text-admin-text-secondary transition hover:text-admin-text"
                >
                    Закрыть
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                <div className="flex flex-col gap-1">
                    {ROOT_LINKS.map((item) => {
                        const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${siteMenuRow} ${
                                    isActive ? "bg-admin-muted text-admin-text" : ""
                                }`}
                                onClick={handleNavigate}
                                aria-current={isActive ? "page" : undefined}
                            >
                                <span className="inline-flex items-center gap-2">
                                    {item.label}
                                    {"badgeKey" in item && item.badgeKey === "wishlist" && wishlistQty > 0 ? (
                                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[10px] font-semibold text-white">
                                            {wishlistQty}
                                        </span>
                                    ) : null}
                                </span>
                            </Link>
                        );
                    })}

                    {burgerLinks.map((item) => {
                        const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${siteMenuRow} ${
                                    isActive ? "bg-admin-muted text-admin-text" : ""
                                }`}
                                onClick={handleNavigate}
                                aria-current={isActive ? "page" : undefined}
                            >
                                {item.label}
                            </Link>
                        );
                    })}

                    {isAuthenticated ? (
                        <div className={`${siteCard} mt-3 p-2`}>
                            <div className="px-2 py-1">
                                <div className="text-sm font-medium text-admin-text">{userName}</div>
                                <div className="mt-0.5 text-xs text-admin-text-secondary">{userPhone}</div>
                            </div>
                            <Link
                                href="/account"
                                className={siteMenuRow}
                                onClick={handleNavigate}
                            >
                                Личный кабинет
                            </Link>
                            <button type="button" className={siteMenuRow} onClick={onLogoutAction}>
                                Выйти
                            </button>
                        </div>
                    ) : (
                        <Link href="/login" className={`${siteBtnPrimary} mt-3 w-full`} onClick={handleNavigate}>
                            Войти
                        </Link>
                    )}

                    {contactLinks.length > 0 ? (
                        <div className={`${siteCard} mt-3 p-3`}>
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                Связаться с нами
                            </div>
                            <div className="flex flex-col gap-1">
                                {phoneLinks.map((phone) => (
                                    <a
                                        key={phone.number}
                                        href={`tel:${phone.number}`}
                                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-admin-text transition hover:bg-admin-muted"
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
                                        className="rounded-lg px-2 py-2 text-sm font-medium text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                    >
                                        {item.label}
                                    </a>
                                ))}
                                <CallbackRequestTrigger className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-admin-primary transition hover:bg-admin-muted" />
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
