"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { WishlistProvider } from "@/components/wishlist/wishlist-provider";

type Props = {
    children: ReactNode;
};

export default function Providers({ children }: Props) {
    return (
        <AuthProvider>
            <WishlistProvider>
                <CartProvider>{children}</CartProvider>
            </WishlistProvider>
        </AuthProvider>
    );
}