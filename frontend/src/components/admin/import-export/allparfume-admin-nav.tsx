"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
    {
        href: "/admin/import-export/allparfume",
        label: "Allparfume",
        match: (path: string) =>
            path === "/admin/import-export/allparfume"
            || (path.startsWith("/admin/import-export/allparfume")
                && !path.startsWith("/admin/import-export/allparfume/shops")),
    },
    {
        href: "/admin/import-export/allparfume/shops",
        label: "Магазины",
        match: (path: string) => path.startsWith("/admin/import-export/allparfume/shops"),
    },
] as const;

function navClass(active: boolean): string {
    const base =
        "relative inline-flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-0.5 text-sm transition-colors";
    if (active) {
        return `${base} border-admin-primary font-semibold text-admin-text`;
    }
    return `${base} border-transparent font-medium text-admin-text-secondary hover:text-admin-text`;
}

export default function AllparfumeAdminNav() {
    const pathname = usePathname();

    return (
        <nav
            className="-mx-1 flex gap-4 overflow-x-auto border-b border-admin-border px-1"
            aria-label="Allparfume"
        >
            {ITEMS.map((item) => {
                const isActive = item.match(pathname);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={navClass(isActive)}
                    >
                        <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
