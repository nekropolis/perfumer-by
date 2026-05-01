"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { WishlistProvider } from "@/components/wishlist/wishlist-provider";
import { SiteContentProvider } from "@/components/layout/site-content-context";
import type { SiteContent } from "@/lib/site-content-api";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content-api";

type Props = {
    children: ReactNode;
    /** Данные из `GET /site/content` (серверный layout). */
    siteContent?: SiteContent;
};

export default function Providers({ children, siteContent = DEFAULT_SITE_CONTENT }: Props) {
    return (
        <SiteContentProvider value={siteContent}>
            <AuthProvider>
                <WishlistProvider>
                    <CartProvider>{children}</CartProvider>
                </WishlistProvider>
            </AuthProvider>
        </SiteContentProvider>
    );
}