"use client";

import type { RefObject } from "react";
import HeaderAccountMenu from "@/components/layout/header/account-menu";
import HeaderCartButton from "@/components/layout/header/header-cart-button";
import HeaderMobileToggle from "@/components/layout/header/header-mobile-toggle";
import HeaderWishlistButton from "@/components/layout/header/header-wishlist-button";

type HeaderActionsProps = {
    wishlistQty: number;
    cartQty: number;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    isMobileOpen: boolean;
    accountRef: RefObject<HTMLDivElement | null>;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onToggleMobileMenuAction: () => void;
};

export default function HeaderActions({
    wishlistQty,
    cartQty,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    isMobileOpen,
    accountRef,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
    onToggleMobileMenuAction,
}: HeaderActionsProps) {
    return (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:gap-3">
            <HeaderWishlistButton qty={wishlistQty} />

            <HeaderAccountMenu
                accountRef={accountRef}
                isAuthenticated={isAuthenticated}
                isAccountOpen={isAccountOpen}
                userName={userName}
                userPhone={userPhone}
                onToggleAction={onToggleAccountAction}
                onCloseAction={onCloseAccountAction}
                onLogoutAction={onLogoutAction}
            />

            <HeaderCartButton qty={cartQty} />
            <HeaderMobileToggle
                isOpen={isMobileOpen}
                onClickAction={onToggleMobileMenuAction}
            />
        </div>
    );
}
