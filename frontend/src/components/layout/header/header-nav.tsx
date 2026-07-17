"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type HeaderNavProps = {
    isCompact: boolean;
    links: ReadonlyArray<HeaderNavLink>;
};

export function HeaderNavFallback({ isCompact, links }: HeaderNavProps) {
    return (
        <div
            className={`bg-admin-surface transition-[max-height,opacity] duration-250 ease-out ${
                isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-12 opacity-100 md:max-h-16"
            }`}
            aria-hidden={isCompact}
        >
            <div className="mx-auto flex h-11 max-w-7xl items-center justify-start gap-1.5 overflow-x-auto px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] md:h-14 md:gap-2 md:py-2 sm:px-6 lg:px-8 [&::-webkit-scrollbar]:hidden">
                {links.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="shrink-0 rounded-full border border-admin-border px-3 py-1.5 text-xs font-medium text-[var(--header-text-secondary)] transition sm:px-4 sm:text-sm"
                    >
                        {item.label}
                    </Link>
                ))}
            </div>
        </div>
    );
}

export default function HeaderNav({ isCompact, links }: HeaderNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <div
            className={`bg-admin-surface transition-[max-height,opacity] duration-250 ease-out ${
                isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-12 opacity-100 md:max-h-16"
            }`}
            aria-hidden={isCompact}
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
                                    : "border-admin-border text-[var(--header-text-secondary)] hover:border-[var(--header-text)]/40 hover:text-[var(--header-text)]"
                            }`}
                            aria-current={isActive ? "page" : undefined}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
