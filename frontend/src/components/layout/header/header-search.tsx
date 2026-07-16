"use client";

import Image from "next/image";
import type { RefObject } from "react";
import ProductStatusLabels from "@/components/product/product-status-labels";
import { renderHighlightedText } from "@/components/layout/header/render-highlighted-text";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";
import { formatSearchPrice } from "@/components/layout/header/format-search-price";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { headerSearchProductTitle } from "@/lib/product-display-name";

type HeaderSearchProps = {
    searchRef: RefObject<HTMLDivElement | null>;
    desktopSearchInputRef: RefObject<HTMLInputElement | null>;
    searchOpen: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    suggestedQuery: string | null;
    recentSearches: string[];
    popularSearches: readonly string[];
    onFocusAction: () => void;
    onChangeAction: (value: string) => void;
    onSubmitAction: () => void;
    onResetAction: () => void;
    onClearRecentAction: () => void;
    onRecentSelectAction: (value: string) => void;
    onPopularSelectAction: (value: string) => void;
    onBrandSelectAction: (slug: string) => void;
    onProductSelectAction: (slug: string) => void;
    onSuggestedQueryAction: (value: string) => void;
};

export default function HeaderSearch({
    searchRef,
    desktopSearchInputRef,
    searchOpen,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    suggestedQuery,
    recentSearches,
    popularSearches,
    onFocusAction,
    onChangeAction,
    onSubmitAction,
    onResetAction,
    onClearRecentAction,
    onRecentSelectAction,
    onPopularSelectAction,
    onBrandSelectAction,
    onProductSelectAction,
    onSuggestedQueryAction,
}: HeaderSearchProps) {
    return (
        <div className="hidden min-w-0 flex-1 md:block">
            <div className="relative min-w-0" ref={searchRef}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--header-text-secondary)]"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>

                <input
                    suppressHydrationWarning
                    ref={desktopSearchInputRef}
                    type="text"
                    name="catalog_search_query"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={searchQuery}
                    onFocus={onFocusAction}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            onSubmitAction();
                        }
                    }}
                    onChange={(e) => onChangeAction(e.target.value)}
                    placeholder="Поиск ароматов, брендов…"
                    className="h-11 min-w-0 w-full rounded-2xl border-0 bg-[var(--header-control-bg)] pl-9 pr-10 text-sm text-[var(--header-text)] outline-none transition placeholder:text-[var(--header-text-secondary)] focus:bg-[var(--header-control-bg)] focus:ring-2 focus:ring-admin-primary/10"
                />

                {searchQuery && (
                    <button
                        type="button"
                        onClick={onResetAction}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent)]"
                    >
                        ×
                    </button>
                )}

                {searchOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-xl">
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
                                                    key={`recent-desktop-${item}`}
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
                                {popularSearches.length > 0 ? (
                                    <div>
                                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                            Популярное
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {popularSearches.map((item) => (
                                                <button
                                                    key={`popular-desktop-${item}`}
                                                    type="button"
                                                    onClick={() => onPopularSelectAction(item)}
                                                    className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                                                >
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
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
                                        Возможно, вы имели в виду: <span className="font-medium">{suggestedQuery}</span>
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <div className="max-h-80 overflow-y-auto">
                                {searchBrandResults.length > 0 ? (
                                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                        Бренды
                                    </div>
                                ) : null}
                                {searchBrandResults.map((brand) => (
                                    <button
                                        key={`desktop-brand-${brand.id}`}
                                        type="button"
                                        onClick={() => onBrandSelectAction(brand.slug)}
                                        className="block w-full rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--background)]"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                                {renderHighlightedText(brand.name, searchQuery)}
                                            </div>
                                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--background)] px-2 text-xs font-medium text-[var(--text-secondary)]">
                                                {brand.products_count}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {searchResults.length > 0 ? (
                                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                        Товары
                                    </div>
                                ) : null}
                                {searchResults.map((item) => {
                                    const imageSrc = item.image
                                        ? normalizeProductImageUrl(item.image)
                                        : null;
                                    const title = headerSearchProductTitle(item);
                                    return (
                                    <button
                                        key={`desktop-${item.id}`}
                                        type="button"
                                        onClick={() => onProductSelectAction(item.slug)}
                                        className="block w-full rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--background)]"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                                                <ProductStatusLabels
                                                    isNew={Boolean(item.is_new)}
                                                    isHit={Boolean(item.is_hit)}
                                                    hasPromotion={Boolean(item.has_promotion ?? item.has_discount)}
                                                    className="left-1 top-1 scale-90 origin-top-left"
                                                />
                                                {imageSrc ? (
                                                    <Image
                                                        src={imageSrc}
                                                        loader={productImageLoader}
                                                        alt={title}
                                                        fill
                                                        sizes="48px"
                                                        className="object-cover"
                                                    />
                                                ) : null}
                                            </div>
                                            <div className="min-w-0">
                                                {item.matched_code ? (
                                                    <div className="truncate text-[11px] font-medium text-[var(--accent)]">
                                                        {renderHighlightedText(item.matched_code, searchQuery)}
                                                    </div>
                                                ) : null}
                                                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                                    {renderHighlightedText(title, searchQuery, {
                                                        brandName: item.brand_name,
                                                    })}
                                                </div>
                                                <div className="truncate text-xs text-[var(--text-secondary)]">
                                                    {formatSearchPrice(item)}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
