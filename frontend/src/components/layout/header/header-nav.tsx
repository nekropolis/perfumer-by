"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { isHeaderNavLinkActive } from "@/lib/header-nav-active";

type HeaderNavProps = {
    isCompact: boolean;
    links: ReadonlyArray<HeaderNavLink>;
};

export default function HeaderNav({ isCompact, links }: HeaderNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <div
            className={`hidden border-t border-admin-border bg-admin-surface transition-[max-height,opacity] duration-250 ease-out md:block ${
                isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-11 opacity-100"
            }`}
            aria-hidden={isCompact}
        >
            <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 px-4 sm:px-6 lg:px-8">
                {links.map((item) => {
                    const isActive = isHeaderNavLinkActive(item.href, pathname, searchParams);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                                isActive
                                    ? "bg-admin-muted text-admin-text"
                                    : "text-admin-text-secondary hover:bg-admin-muted/70 hover:text-admin-text"
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
