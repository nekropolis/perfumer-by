"use client";

import type { RefObject } from "react";
import { Search } from "lucide-react";
import HeaderAccountMenu from "@/components/layout/header/account-menu";
import HeaderBurgerMenu from "@/components/layout/header/header-burger-menu";
import HeaderCartButton from "@/components/layout/header/header-cart-button";
import HeaderMobileToggle from "@/components/layout/header/header-mobile-toggle";
import HeaderWishlistButton from "@/components/layout/header/header-wishlist-button";
import type { HeaderNavLink } from "@/components/layout/header/types";
import { headerBtnIcon } from "@/lib/site-ui-classes";

type HeaderActionsProps = {
    wishlistQty: number;
    cartQty: number;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    isMobileOpen: boolean;
    isBurgerOpen: boolean;
    burgerLinks: ReadonlyArray<HeaderNavLink>;
    accountRef: RefObject<HTMLDivElement | null>;
    burgerMenuRef: RefObject<HTMLDivElement | null>;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onOpenMobileSearchAction: () => void;
    onToggleMobileMenuAction: () => void;
    onToggleBurgerMenuAction: () => void;
    onCloseBurgerMenuAction: () => void;
};

export default function HeaderActions({
    wishlistQty,
    cartQty,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    isMobileOpen,
    isBurgerOpen,
    burgerLinks,
    accountRef,
    burgerMenuRef,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
    onOpenMobileSearchAction,
    onToggleMobileMenuAction,
    onToggleBurgerMenuAction,
    onCloseBurgerMenuAction,
}: HeaderActionsProps) {
    return (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5 sm:gap-2">
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

            <HeaderWishlistButton qty={wishlistQty} className="hidden md:inline-flex" />

            <button
                type="button"
                className={`${headerBtnIcon} md:hidden`}
                onClick={onOpenMobileSearchAction}
                aria-label="Открыть поиск"
            >
                <Search className="h-5 w-5 md:h-4 md:w-4" />
            </button>

            <HeaderCartButton qty={cartQty} />

            <HeaderBurgerMenu
                links={burgerLinks}
                isOpen={isBurgerOpen}
                menuRef={burgerMenuRef}
                onToggleAction={onToggleBurgerMenuAction}
                onCloseAction={onCloseBurgerMenuAction}
            />

            <HeaderMobileToggle
                isOpen={isMobileOpen}
                onClickAction={onToggleMobileMenuAction}
            />
        </div>
    );
}
