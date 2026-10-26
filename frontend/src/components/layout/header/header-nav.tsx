"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type HeaderNavProps = {
    isCompact: boolean;
    hideBelowMd?: boolean;
    links: ReadonlyArray<HeaderNavLink>;
    onLocationAction?: (location: string) => void;
};

export function HeaderNavFallback({ isCompact, hideBelowMd = false, links }: HeaderNavProps) {
    return (
        <nav
            aria-label="Категории"
            aria-hidden={isCompact || undefined}
            inert={isCompact ? true : undefined}
            className={`bg-admin-surface transition-[max-height,opacity] duration-250 ease-out ${
                hideBelowMd ? "max-md:hidden" : ""
            } ${isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-12 opacity-100 md:max-h-16"}`}
        >
            <div className="mx-auto flex h-11 max-w-7xl items-center justify-start gap-1.5 overflow-x-auto px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] md:h-14 md:gap-2 md:py-2 sm:px-6 lg:px-8 [&::-webkit-scrollbar]:hidden">
                {links.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="shrink-0 rounded-full border border-admin-border px-3 py-1.5 text-xs font-medium text-[var(--header-text-secondary)] transition hover:border-[var(--header-text)]/40 hover:bg-[var(--header-control-bg)] hover:text-[var(--header-text)] sm:px-4 sm:text-sm"
                    >
                        {item.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}

export default function HeaderNav({ isCompact, hideBelowMd = false, links, onLocationAction }: HeaderNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const location = search ? `${pathname}?${search}` : pathname;

    useLayoutEffect(() => {
        onLocationAction?.(location);
    }, [location, onLocationAction]);

    return (
        <nav
            aria-label="Категории"
            aria-hidden={isCompact || undefined}
            inert={isCompact ? true : undefined}
            className={`bg-admin-surface transition-[max-height,opacity] duration-250 ease-out ${
                hideBelowMd ? "max-md:hidden" : ""
            } ${isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-12 opacity-100 md:max-h-16"}`}
        >
            <div className="mx-auto flex h-11 max-w-7xl items-center justify-start gap-1.5 overflow-x-auto px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] md:h-14 md:gap-2 md:py-2 sm:px-6 lg:px-8 [&::-webkit-scrollbar]:hidden">
                {links.map((item) => {
                    const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:text-sm ${
                                isActive
                                    ? "border-[var(--header-text)] bg-admin-surface text-[var(--header-text)]"
                                    : "border-admin-border text-[var(--header-text-secondary)] hover:border-[var(--header-text)]/40 hover:bg-[var(--header-control-bg)] hover:text-[var(--header-text)]"
                            }`}
                            aria-current={isActive ? "page" : undefined}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
