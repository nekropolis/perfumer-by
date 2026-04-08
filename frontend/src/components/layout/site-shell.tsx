"use client";

import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/cart-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

type Props = {
    children: ReactNode;
};

export default function SiteShell({ children }: Props) {
    return (
        <CartProvider>
            <Header />
            {children}
            <Footer />
        </CartProvider>
    );
}