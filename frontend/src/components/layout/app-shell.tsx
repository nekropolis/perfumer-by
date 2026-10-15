"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/header";
import RecentlyViewedSection from "@/components/layout/recently-viewed-section";
import ScrollToTopButton from "@/components/layout/scroll-to-top-button";

function recentlyViewedExcludeSlug(pathname: string): string | null {
    if (!/^\/[^/]+$/.test(pathname) || pathname === "/") {
        return null;
    }

    return pathname.slice(1);
}

type Props = {
    children: ReactNode;
    footer: ReactNode;
};

export default function AppShell({ children, footer }: Props) {
    const pathname = usePathname();
    const isAdminPage = pathname.startsWith("/admin");

    if (isAdminPage) {
        return <>{children}</>;
    }

    return (
        <>
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-2xl focus:bg-admin-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-admin-primary"
            >
                Перейти к содержимому
            </a>
            <Header />
            {/* Pages own <main> for a11y/SEO; avoid nested <main> hydration/DOM repair issues */}
            <div id="main-content" tabIndex={-1} className="w-full min-w-0 max-w-full">
                {children}
            </div>
            <RecentlyViewedSection excludeSlug={recentlyViewedExcludeSlug(pathname)} />
            {footer}
            <ScrollToTopButton />
        </>
    );
}