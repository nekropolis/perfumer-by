"use client";

import type { RefObject } from "react";
import { Suspense } from "react";
import HeaderAccountMenu from "@/components/layout/header/account-menu";
import HeaderBurgerMenu, { HeaderBurgerMenuFallback } from "@/components/layout/header/header-burger-menu";
import HeaderCartButton from "@/components/layout/header/header-cart-button";
import type { HeaderNavLink } from "@/components/layout/header/types";

type HeaderActionsProps = {
    cartQty: number;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    isBurgerOpen: boolean;
    burgerLinks: ReadonlyArray<HeaderNavLink>;
    tabletBurgerLinks: ReadonlyArray<HeaderNavLink>;
    accountRef: RefObject<HTMLDivElement | null>;
    burgerMenuRef: RefObject<HTMLDivElement | null>;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onToggleBurgerMenuAction: () => void;
    onCloseBurgerMenuAction: () => void;
};

export default function HeaderActions({
    cartQty,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    isBurgerOpen,
    burgerLinks,
    tabletBurgerLinks,
    accountRef,
    burgerMenuRef,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
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

            <HeaderCartButton qty={cartQty} className="hidden md:inline-flex" />

            <Suspense fallback={<HeaderBurgerMenuFallback />}>
                <HeaderBurgerMenu
                    links={burgerLinks}
                    tabletLinks={tabletBurgerLinks}
                    isOpen={isBurgerOpen}
                    menuRef={burgerMenuRef}
                    onToggleAction={onToggleBurgerMenuAction}
                    onCloseAction={onCloseBurgerMenuAction}
                />
            </Suspense>
        </div>
    );
}
