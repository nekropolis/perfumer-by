"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import ScrollToTopButton from "@/components/layout/scroll-to-top-button";

type Props = {
    children: ReactNode;
};

export default function AppShell({ children }: Props) {
    const pathname = usePathname();
    const isAdminPage = pathname.startsWith("/admin");

    if (isAdminPage) {
        return <>{children}</>;
    }

    return (
        <>
            <Header />
            {/* Pages own <main> for a11y/SEO; avoid nested <main> hydration/DOM repair issues */}
            <div className="min-w-0 overflow-visible">{children}</div>
            <Footer />
            <ScrollToTopButton />
        </>
    );
}