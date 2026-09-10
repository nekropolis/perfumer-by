"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { Menu, X } from "lucide-react";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";
import { headerBtnIcon, siteBtnGhost } from "@/lib/site-ui-classes";

type HeaderBurgerMenuProps = {
    links: ReadonlyArray<HeaderNavLink>;
    tabletLinks?: ReadonlyArray<HeaderNavLink>;
    isOpen: boolean;
    menuRef: RefObject<HTMLDivElement | null>;
    onToggleAction: () => void;
    onCloseAction: () => void;
};

export function HeaderBurgerMenuFallback() {
    return (
        <div className="relative hidden md:block" aria-hidden>
            <button type="button" className={headerBtnIcon} tabIndex={-1}>
                <Menu className="h-5 w-5" />
            </button>
        </div>
    );
}

function BurgerMenuLink({
    item,
    pathname,
    searchParams,
    onCloseAction,
    className = "",
}: {
    item: HeaderNavLink;
    pathname: string;
    searchParams: ReturnType<typeof useSearchParams>;
    onCloseAction: () => void;
    className?: string;
}) {
    const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

    return (
        <Link
            href={item.href}
            className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm ${
                isActive ? "bg-admin-muted text-admin-text" : ""
            } ${className}`}
            onClick={onCloseAction}
            aria-current={isActive ? "page" : undefined}
        >
            {item.label}
        </Link>
    );
}

export default function HeaderBurgerMenu({
    links,
    tabletLinks = [],
    isOpen,
    menuRef,
    onToggleAction,
    onCloseAction,
}: HeaderBurgerMenuProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <div className="relative hidden md:block" ref={menuRef}>
            <button
                type="button"
                className={headerBtnIcon}
                onClick={onToggleAction}
                aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
                aria-expanded={isOpen}
            >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {isOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-48 rounded-xl border border-admin-border bg-admin-surface p-1.5 shadow-xl">
                    {tabletLinks.map((item) => (
                        <BurgerMenuLink
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            searchParams={searchParams}
                            onCloseAction={onCloseAction}
                            className="xl:hidden"
                        />
                    ))}
                    {tabletLinks.length > 0 ? (
                        <div className="my-1 h-px bg-admin-border xl:hidden" aria-hidden />
                    ) : null}
                    {links.map((item) => (
                        <BurgerMenuLink
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            searchParams={searchParams}
                            onCloseAction={onCloseAction}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
