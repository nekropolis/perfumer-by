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
    isOpen: boolean;
    menuRef: RefObject<HTMLDivElement | null>;
    onToggleAction: () => void;
    onCloseAction: () => void;
};

export default function HeaderBurgerMenu({
    links,
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
                    {links.map((item) => {
                        const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm ${
                                    isActive ? "bg-admin-muted text-admin-text" : ""
                                }`}
                                onClick={onCloseAction}
                                aria-current={isActive ? "page" : undefined}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
