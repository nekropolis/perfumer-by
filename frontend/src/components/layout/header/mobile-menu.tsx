"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import { siteBtnPrimary, siteCard, siteMenuRow } from "@/lib/site-ui-classes";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type MenuPanel = "root" | "catalog" | "content";

type CatalogSection = {
    title: string;
    links: ReadonlyArray<{ label: string; href: string }>;
};

type Props = {
    isOpen: boolean;
    anchorBottom: number;
    wishlistQty: number;
    catalogSections: ReadonlyArray<CatalogSection>;
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
    { label: "Новинки", href: "/catalog?new=1" },
    { label: "Хиты", href: "/catalog?hit=1" },
    { label: "Акции", href: "/catalog?sale=1" },
    { label: "Бренды", href: "/brands" },
    { label: "Избранное", href: "/wishlist", badgeKey: "wishlist" as const },
] as const;

const CONTENT_LINKS = [
    { label: "Новости", href: "/news" },
    { label: "Статьи", href: "/articles" },
    { label: "Отзывы о магазине", href: "/reviews" },
    { label: "Контакты", href: "/contacts" },
] as const;

export default function HeaderMobileMenu({
    isOpen,
    anchorBottom,
    wishlistQty,
    catalogSections,
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
    const [panel, setPanel] = useState<MenuPanel>("root");

    if (!isOpen) {
        return null;
    }

    const handleClose = () => {
        setPanel("root");
        onCloseAction();
    };

    const handleNavigate = () => {
        setPanel("root");
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

    const panelTitle =
        panel === "catalog" ? "Каталог" : panel === "content" ? "Разделы" : "Меню";

    return (
        <div
            ref={menuRootRef}
            className="fixed inset-x-0 bottom-0 z-[130] flex flex-col overflow-hidden bg-admin-surface md:hidden"
            style={{ top: `${anchorBottom || 64}px` }}
        >
            <div className="flex shrink-0 items-center gap-2 border-b border-admin-border px-4 py-3">
                {panel !== "root" ? (
                    <button
                        type="button"
                        onClick={() => setPanel("root")}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                        aria-label="Назад"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                ) : null}
                <h2 className="min-w-0 flex-1 text-base font-semibold text-admin-text">{panelTitle}</h2>
                <button
                    type="button"
                    onClick={handleClose}
                    className="text-sm font-medium text-admin-text-secondary transition hover:text-admin-text"
                >
                    Закрыть
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                {panel === "root" ? (
                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            className={siteMenuRow}
                            onClick={() => setPanel("catalog")}
                        >
                            <span>Каталог</span>
                            <ChevronRight className="h-4 w-4 text-admin-text-muted" />
                        </button>

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

                        <button
                            type="button"
                            className={siteMenuRow}
                            onClick={() => setPanel("content")}
                        >
                            <span>Новости и статьи</span>
                            <ChevronRight className="h-4 w-4 text-admin-text-muted" />
                        </button>

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
                ) : null}

                {panel === "catalog" ? (
                    <div className="space-y-6">
                        {catalogSections.map((section) => (
                            <div key={section.title}>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                    {section.title}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    {section.links.map((link) => (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className={siteMenuRow}
                                            onClick={handleNavigate}
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}

                {panel === "content" ? (
                    <div className="flex flex-col gap-0.5">
                        {CONTENT_LINKS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={siteMenuRow}
                                onClick={handleNavigate}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
