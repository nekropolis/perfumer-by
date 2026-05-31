"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import HeaderActions from "@/components/layout/header/header-actions";
import HeaderCatalogButton from "@/components/layout/header/header-catalog-button";
import HeaderLogo from "@/components/layout/header/header-logo";
import { renderHighlightedText } from "@/components/layout/header/render-highlighted-text";
import HeaderSearch from "@/components/layout/header/header-search";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";
import { formatSearchPrice } from "@/components/layout/header/format-search-price";
import { headerSearchProductTitle } from "@/lib/product-display-name";

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
    suggestedQuery: string | null;
    recentSearches: string[];
    popularSearches: readonly string[];
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
    onSuggestedQueryAction: (value: string) => void;
    onToggleAccountAction: () => void;
    onCloseAccountAction: () => void;
    onLogoutAction: () => void;
    onOpenMobileSearchAction: () => void;
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
    suggestedQuery,
    recentSearches,
    popularSearches,
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
    onSuggestedQueryAction,
    onToggleAccountAction,
    onCloseAccountAction,
    onLogoutAction,
    onOpenMobileSearchAction,
    onToggleMobileMenuAction,
}: HeaderMainRowProps) {
    const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (searchOpen && !isMobileOpen) {
            mobileSearchInputRef.current?.focus();
        }
    }, [searchOpen, isMobileOpen]);

    return (
        <div className="overflow-x-clip bg-[var(--header-bg)]">
            <div className="mx-auto max-w-7xl min-w-0 px-4 sm:px-6 lg:px-8">
                <div className="flex h-[78px] min-h-0 min-w-0 items-center gap-3 md:gap-4">
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
                        onOpenMobileSearchAction={onOpenMobileSearchAction}
                        onToggleMobileMenuAction={onToggleMobileMenuAction}
                    />
                </div>

                {searchOpen && !isMobileOpen ? (
                    <div className="pb-3 md:hidden">
                        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-2">
                            <div className="relative">
                                <Search
                                    size={15}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                />
                                <input
                                    ref={mobileSearchInputRef}
                                    type="text"
                                    name="catalog_search_query_mobile"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-form-type="other"
                                    value={searchQuery}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            onSearchSubmitAction();
                                        }
                                    }}
                                    onChange={(e) => onSearchChangeAction(e.target.value)}
                                    placeholder="Товары, бренды, код или артикул…"
                                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--header-control-bg)] py-2.5 pl-9 pr-9 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)] focus:bg-[var(--header-control-bg)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSearchChangeAction("");
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-secondary)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                                    aria-label="Очистить поиск"
                                    title="Очистить поиск"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="mt-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-2">
                                {searchLoading ? (
                                    <div className="px-3 py-3 text-sm text-[var(--text-secondary)]">Поиск...</div>
                                ) : searchQuery.trim().length < 2 ? (
                                    <div className="space-y-4 px-3 py-3">
                                        <div>
                                            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                                <span>Последние запросы</span>
                                                <button
                                                    type="button"
                                                    onClick={onClearRecentAction}
                                                    className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                                >
                                                    Очистить
                                                </button>
                                            </div>
                                            {recentSearches.length > 0 ? (
                                                <div className="space-y-1">
                                                    {recentSearches.map((item) => (
                                                        <button
                                                            key={`recent-inline-${item}`}
                                                            type="button"
                                                            onClick={() => onRecentSelectAction(item)}
                                                            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                                        >
                                                            {renderHighlightedText(item, searchQuery)}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-[var(--text-secondary)]">Пока пусто</div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                                Популярное
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {popularSearches.map((item) => (
                                                    <button
                                                        key={`popular-inline-${item}`}
                                                        type="button"
                                                        onClick={() => onPopularSelectAction(item)}
                                                        className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                                                    >
                                                        {item}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : searchBrandResults.length === 0 && searchResults.length === 0 ? (
                                    <div className="px-3 py-3 text-sm text-[var(--text-secondary)]">
                                        <div>Ничего не найдено</div>
                                        {suggestedQuery ? (
                                            <button
                                                type="button"
                                                onClick={() => onSuggestedQueryAction(suggestedQuery)}
                                                className="mt-2 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                            >
                                                Возможно, вы имели в виду:{" "}
                                                <span className="font-medium">{suggestedQuery}</span>
                                            </button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="max-h-72 overflow-y-auto">
                                        {searchBrandResults.map((brand) => (
                                            <button
                                                key={`inline-brand-${brand.id}`}
                                                type="button"
                                                onClick={() => onBrandSelectAction(brand.slug)}
                                                className="block w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[var(--background)]"
                                            >
                                                {renderHighlightedText(brand.name, searchQuery)}
                                            </button>
                                        ))}
                                        {searchResults.map((item) => {
                                            const title = headerSearchProductTitle(item);
                                            return (
                                            <button
                                                key={`inline-product-${item.id}`}
                                                type="button"
                                                onClick={() => onProductSelectAction(item.slug)}
                                                className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-[var(--background)]"
                                            >
                                                {item.matched_code ? (
                                                    <div className="truncate text-[11px] font-medium text-[var(--accent)]">
                                                        {renderHighlightedText(item.matched_code, searchQuery)}
                                                    </div>
                                                ) : null}
                                                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                                    {renderHighlightedText(title, searchQuery)}
                                                </div>
                                                <div className="truncate text-xs text-[var(--text-secondary)]">
                                                    {formatSearchPrice(item)}
                                                </div>
                                            </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
