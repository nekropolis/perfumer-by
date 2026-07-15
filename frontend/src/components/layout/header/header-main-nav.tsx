"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type HeaderMainNavProps = {
    links: ReadonlyArray<HeaderNavLink>;
};

export function HeaderMainNavFallback({ links }: HeaderMainNavProps) {
    return (
        <nav className="hidden shrink-0 items-center gap-1 lg:flex" aria-label="Основная навигация">
            {links.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className="whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium text-[var(--header-text-secondary)] transition hover:bg-[var(--header-control-bg)] hover:text-[var(--header-text)]"
                >
                    {item.label}
                </Link>
            ))}
        </nav>
    );
}

export default function HeaderMainNav({ links }: HeaderMainNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <nav className="hidden shrink-0 items-center gap-1 lg:flex" aria-label="Основная навигация">
            {links.map((item) => {
                const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition hover:bg-[var(--header-control-bg)] ${
                            isActive
                                ? "text-[var(--header-text)]"
                                : "text-[var(--header-text-secondary)] hover:text-[var(--header-text)]"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
