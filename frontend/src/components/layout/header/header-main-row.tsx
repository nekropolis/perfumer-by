"use client";

import { Suspense, type RefObject } from "react";
import HeaderActions from "@/components/layout/header/header-actions";
import HeaderLogo from "@/components/layout/header/header-logo";
import HeaderMainNav, { HeaderMainNavFallback } from "@/components/layout/header/header-main-nav";
import HeaderSearch from "@/components/layout/header/header-search";
import type { HeaderNavLink, HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";

type HeaderMainRowProps = {
    searchRef: RefObject<HTMLDivElement | null>;
    desktopSearchInputRef: RefObject<HTMLInputElement | null>;
    accountRef: RefObject<HTMLDivElement | null>;
    burgerMenuRef: RefObject<HTMLDivElement | null>;
    mainNavLinks: ReadonlyArray<HeaderNavLink>;
    burgerLinks: ReadonlyArray<HeaderNavLink>;
    searchOpen: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    suggestedQuery: string | null;
    recentSearches: string[];
    popularSearches: readonly string[];
    wishlistQty: number;
    cartQty: number;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    isBurgerOpen: boolean;
    onSearchFocusAction: () => void;
    onSearchChangeAction: (value: string) => void;
    onSearchSubmitAction: () => void;
    onSearchResetAction: () => void;
    onClearRecentAction: () => void;
    onRecentSelectAction: (value: string) => void;
    onPopularSelectAction: (value: string) => void;
    onBrandSelectAction: (slug: string) => void;
    onProductSelectAction: (slug: string) => void;
    onSuggestedQueryAction: (value: string) => void;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onToggleBurgerMenuAction: () => void;
    onCloseBurgerMenuAction: () => void;
};

export default function HeaderMainRow({
    searchRef,
    desktopSearchInputRef,
    accountRef,
    burgerMenuRef,
    mainNavLinks,
    burgerLinks,
    searchOpen,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    suggestedQuery,
    recentSearches,
    popularSearches,
    wishlistQty,
    cartQty,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    isBurgerOpen,
    onSearchFocusAction,
    onSearchChangeAction,
    onSearchSubmitAction,
    onSearchResetAction,
    onClearRecentAction,
    onRecentSelectAction,
    onPopularSelectAction,
    onBrandSelectAction,
    onProductSelectAction,
    onSuggestedQueryAction,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
    onToggleBurgerMenuAction,
    onCloseBurgerMenuAction,
}: HeaderMainRowProps) {
    return (
        <div className="relative z-10 overflow-x-clip bg-admin-surface">
            <div className="mx-auto max-w-7xl min-w-0 px-3 sm:px-6 lg:px-8">
                <div className="flex h-[52px] min-h-0 min-w-0 items-center gap-2 sm:gap-3 md:h-[64px] portrait:md:h-[78px] lg:h-[78px] lg:gap-4">
                    <HeaderLogo />

                    <HeaderSearch
                        searchRef={searchRef}
                        desktopSearchInputRef={desktopSearchInputRef}
                        searchOpen={searchOpen}
                        searchLoading={searchLoading}
                        searchQuery={searchQuery}
                        searchResults={searchResults}
                        searchBrandResults={searchBrandResults}
                        suggestedQuery={suggestedQuery}
                        recentSearches={recentSearches}
                        popularSearches={popularSearches}
                        onFocusAction={onSearchFocusAction}
                        onChangeAction={onSearchChangeAction}
                        onSubmitAction={onSearchSubmitAction}
                        onResetAction={onSearchResetAction}
                        onClearRecentAction={onClearRecentAction}
                        onRecentSelectAction={onRecentSelectAction}
                        onPopularSelectAction={onPopularSelectAction}
                        onBrandSelectAction={onBrandSelectAction}
                        onProductSelectAction={onProductSelectAction}
                        onSuggestedQueryAction={onSuggestedQueryAction}
                    />

                    <Suspense fallback={<HeaderMainNavFallback links={mainNavLinks} />}>
                        <HeaderMainNav links={mainNavLinks} />
                    </Suspense>

                    <HeaderActions
                        wishlistQty={wishlistQty}
                        cartQty={cartQty}
                        isAuthenticated={isAuthenticated}
                        isAccountOpen={isAccountOpen}
                        userName={userName}
                        userPhone={userPhone}
                        isBurgerOpen={isBurgerOpen}
                        burgerLinks={burgerLinks}
                        tabletBurgerLinks={mainNavLinks}
                        accountRef={accountRef}
                        burgerMenuRef={burgerMenuRef}
                        onToggleAccountAction={onToggleAccountAction}
                        onCloseAccountAction={onCloseAccountAction}
                        onLogoutAction={onLogoutAction}
                        onToggleBurgerMenuAction={onToggleBurgerMenuAction}
                        onCloseBurgerMenuAction={onCloseBurgerMenuAction}
                    />
                </div>
            </div>
        </div>
    );
}
