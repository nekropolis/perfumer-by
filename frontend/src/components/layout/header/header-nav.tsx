"use client";

import Link from "next/link";

type HeaderNavProps = {
    isCompact: boolean;
    links: ReadonlyArray<{ label: string; href: string }>;
};

export default function HeaderNav({ isCompact, links }: HeaderNavProps) {
    return (
        <div
            className={`hidden bg-[var(--header-bg)] transition-[max-height,opacity,border-color] duration-250 ease-out md:block ${isCompact
                    ? "max-h-0 overflow-hidden border-t border-transparent opacity-0"
                    : "max-h-11 border-t border-[var(--header-line)] opacity-100"
                }`}
            aria-hidden={isCompact}
        >
            <div className="mx-auto flex h-11 max-w-7xl items-center gap-7 px-4 sm:px-6 lg:px-8">
                {links.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="group relative text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--foreground)]"
                    >
                        <span>{item.label}</span>
                        <span className="absolute -bottom-[11px] left-0 h-px w-0 bg-[var(--accent)] transition-all duration-200 group-hover:w-full" />
                    </Link>
                ))}
            </div>
        </div>
    );
}
