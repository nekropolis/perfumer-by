"use client";

import type { ReactNode, RefObject } from "react";
import HeaderActions from "@/components/layout/header/header-actions";
import HeaderCatalogButton from "@/components/layout/header/header-catalog-button";
import HeaderLogo from "@/components/layout/header/header-logo";
import HeaderSearch from "@/components/layout/header/header-search";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";

type HeaderMainRowProps = {
    searchRef: RefObject<HTMLDivElement | null>;
    desktopSearchInputRef: RefObject<HTMLInputElement | null>;
    accountRef: RefObject<HTMLDivElement | null>;
    catalogTriggerLabel: string;
    searchOpen: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    recentSearches: string[];
    popularSearches: readonly string[];
    formatSearchPrice: (item: HeaderSearchItem) => ReactNode;
    wishlistQty: number;
    cartQty: number;
    isAuthenticated: boolean;
    isAccountOpen: boolean;
    userName: string;
    userPhone: string;
    isMobileOpen: boolean;
    onOpenCatalogDrawerAction: () => void;
    onSearchFocusAction: () => void;
    onSearchChangeAction: (value: string) => void;
    onSearchSubmitAction: () => void;
    onSearchResetAction: () => void;
    onClearRecentAction: () => void;
    onRecentSelectAction: (value: string) => void;
    onPopularSelectAction: (value: string) => void;
    onBrandSelectAction: (slug: string) => void;
    onProductSelectAction: (slug: string) => void;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onToggleMobileMenuAction: () => void;
};

export default function HeaderMainRow({
    searchRef,
    desktopSearchInputRef,
    accountRef,
    catalogTriggerLabel,
    searchOpen,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    recentSearches,
    popularSearches,
    formatSearchPrice,
    wishlistQty,
    cartQty,
    isAuthenticated,
    isAccountOpen,
    userName,
    userPhone,
    isMobileOpen,
    onOpenCatalogDrawerAction,
    onSearchFocusAction,
    onSearchChangeAction,
    onSearchSubmitAction,
    onSearchResetAction,
    onClearRecentAction,
    onRecentSelectAction,
    onPopularSelectAction,
    onBrandSelectAction,
    onProductSelectAction,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
    onToggleMobileMenuAction,
}: HeaderMainRowProps) {
    return (
        <div className="bg-[var(--background)]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-[78px] items-center gap-3 md:gap-4">
                    <div className="flex shrink-0 items-center gap-3">
                        <HeaderLogo />
                        <HeaderCatalogButton
                            label={catalogTriggerLabel}
                            onClickAction={onOpenCatalogDrawerAction}
                        />
                    </div>

                    <HeaderSearch
                        searchRef={searchRef}
                        desktopSearchInputRef={desktopSearchInputRef}
                        searchOpen={searchOpen}
                        searchLoading={searchLoading}
                        searchQuery={searchQuery}
                        searchResults={searchResults}
                        searchBrandResults={searchBrandResults}
                        recentSearches={recentSearches}
                        popularSearches={popularSearches}
                        formatSearchPrice={formatSearchPrice}
                        onFocusAction={onSearchFocusAction}
                        onChangeAction={onSearchChangeAction}
                        onSubmitAction={onSearchSubmitAction}
                        onResetAction={onSearchResetAction}
                        onClearRecentAction={onClearRecentAction}
                        onRecentSelectAction={onRecentSelectAction}
                        onPopularSelectAction={onPopularSelectAction}
                        onBrandSelectAction={onBrandSelectAction}
                        onProductSelectAction={onProductSelectAction}
                    />

                    <HeaderActions
                        wishlistQty={wishlistQty}
                        cartQty={cartQty}
                        isAuthenticated={isAuthenticated}
                        isAccountOpen={isAccountOpen}
                        userName={userName}
                        userPhone={userPhone}
                        isMobileOpen={isMobileOpen}
                        accountRef={accountRef}
                        onToggleAccountAction={onToggleAccountAction}
                        onCloseAccountAction={onCloseAccountAction}
                        onLogoutAction={onLogoutAction}
                        onToggleMobileMenuAction={onToggleMobileMenuAction}
                    />
                </div>
            </div>
        </div>
    );
}
