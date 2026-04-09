"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

type Props = {
    children: ReactNode;
};

export default function SiteShell({ children }: Props) {
    const pathname = usePathname();
    const isAdminPage = pathname.startsWith("/admin");

    return (
        <AuthProvider>
            <CartProvider>
                <Header />
                {children}
                {!isAdminPage && <Footer />}
            </CartProvider>
        </AuthProvider>
    );
}