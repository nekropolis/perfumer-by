"use client";

import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/cart-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

type Props = {
    children: ReactNode;
};

export default function SiteShell({ children }: Props) {
    return (
        <AuthProvider>
            <CartProvider>
                <Header />
                <main>{children}</main>
                <Footer />
            </CartProvider>
        </AuthProvider>
    );
}