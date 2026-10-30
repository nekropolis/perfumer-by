"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatSearchPrice } from "@/components/layout/header/format-search-price";
import { renderHighlightedText } from "@/components/layout/header/render-highlighted-text";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { headerSearchProductTitle } from "@/lib/product-display-name";
import { siteBtnSecondary } from "@/lib/site-ui-classes";

type Props = {
    open: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    suggestedQuery: string | null;
    recentSearches: string[];
    popularSearches: readonly string[];
    onChangeAction: (value: string) => void;
    onSubmitAction: () => void;
    onCloseAction: () => void;
    onClearRecentAction: () => void;
    onRecentSelectAction: (value: string) => void;
    onPopularSelectAction: (value: string) => void;
    onBrandSelectAction: (slug: string) => void;
    onProductSelectAction: (slug: string) => void;
    onSuggestedQueryAction: (value: string) => void;
};

export default function MobileSearchSheet({
    open,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    suggestedQuery,
    recentSearches,
    popularSearches,
    onChangeAction,
    onSubmitAction,
    onCloseAction,
    onClearRecentAction,
    onRecentSelectAction,
    onPopularSelectAction,
    onBrandSelectAction,
    onProductSelectAction,
    onSuggestedQueryAction,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [isPhone, setIsPhone] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)");
        const sync = () => setIsPhone(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

    useEffect(() => {
        if (!open || !isPhone) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
        });

        return () => window.cancelAnimationFrame(frame);
    }, [open, isPhone]);

    useEffect(() => {
        if (!open || !isPhone) {
            return;
        }

        const unlock = lockBodyScroll();
        const blockBackgroundScroll = (event: TouchEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }
            // Разрешаем скролл списка и тачбар; остальное (фон + шапка шита) блокируем.
            // Нельзя искать по aria-label «Поиск» — в DOM уже есть инпут шапки с тем же label.
            const list = listRef.current;
            const tabBar = document.querySelector("nav.storefront-tab-bar");
            if (list?.contains(target) || tabBar?.contains(target)) {
                return;
            }
            event.preventDefault();
        };
        document.addEventListener("touchmove", blockBackgroundScroll, { passive: false });

        return () => {
            unlock();
            document.removeEventListener("touchmove", blockBackgroundScroll);
        };
    }, [open, isPhone]);

    if (!open || !isPhone || typeof document === "undefined") {
        return null;
    }

    const query = searchQuery.trim();

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск по каталогу"
            className="storefront-keyboard-sheet fixed inset-x-0 top-0 z-[145] flex flex-col bg-admin-surface md:hidden"
            data-storefront-keyboard-dock=""
            style={{
                bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
            }}
        >
            <div className="shrink-0 border-b border-admin-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="relative">
                    <Search
                        size={18}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-secondary"
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        name="catalog_search_query_mobile"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="search"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        value={searchQuery}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                onSubmitAction();
                            }
                        }}
                        onChange={(event) => onChangeAction(event.target.value)}
                        placeholder="Товары, бренды, код или артикул…"
                        className="w-full rounded-2xl border-0 bg-[var(--header-control-bg)] py-3 pl-10 pr-10 text-base text-admin-text outline-none placeholder:text-admin-text-secondary focus:ring-2 focus:ring-admin-primary/15"
                    />
                    {searchQuery ? (
                        <button
                            type="button"
                            onClick={() => onChangeAction("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-admin-text-secondary"
                            aria-label="Очистить поиск"
                        >
                            <X size={16} />
                        </button>
                    ) : null}
                </div>
            </div>

            <div
                ref={listRef}
                className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]"
            >
                {searchLoading ? (
                    <div className="px-1 py-3 text-sm text-admin-text-secondary">Поиск...</div>
                ) : query.length < 2 ? (
                    <div className="space-y-5">
                        <div>
                            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-admin-text-secondary">
                                <span>Последние запросы</span>
                                {recentSearches.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={onClearRecentAction}
                                        className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-admin-text-secondary"
                                    >
                                        Очистить
                                    </button>
                                ) : null}
                            </div>
                            {recentSearches.length > 0 ? (
                                <div className="space-y-1">
                                    {recentSearches.map((item) => (
                                        <button
                                            key={`recent-sheet-${item}`}
                                            type="button"
                                            onClick={() => onRecentSelectAction(item)}
                                            className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-admin-text transition-colors active:bg-[var(--header-control-bg)]"
                                        >
                                            {renderHighlightedText(item, searchQuery)}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="px-3 text-sm text-admin-text-secondary">Пока пусто</div>
                            )}
                        </div>
                        {popularSearches.length > 0 ? (
                            <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-admin-text-secondary">
                                    Популярное
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {popularSearches.map((item) => (
                                        <button
                                            key={`popular-sheet-${item}`}
                                            type="button"
                                            onClick={() => onPopularSelectAction(item)}
                                            className="rounded-full border border-admin-border bg-admin-surface px-3 py-1.5 text-sm text-admin-text-secondary transition-colors active:bg-[var(--header-control-bg)]"
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : searchBrandResults.length === 0 && searchResults.length === 0 ? (
                    <div className="px-1 py-3 text-sm text-admin-text-secondary">
                        <div>Ничего не найдено</div>
                        {suggestedQuery ? (
                            <button
                                type="button"
                                onClick={() => onSuggestedQueryAction(suggestedQuery)}
                                className="mt-2 rounded-2xl border border-admin-border px-2.5 py-1.5 text-left text-sm text-admin-text transition-colors active:bg-[var(--header-control-bg)]"
                            >
                                Возможно, вы имели в виду:{" "}
                                <span className="font-medium">{suggestedQuery}</span>
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div>
                        {searchBrandResults.map((brand) => (
                            <button
                                key={`sheet-brand-${brand.id}`}
                                type="button"
                                onClick={() => onBrandSelectAction(brand.slug)}
                                className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-admin-text transition-colors active:bg-[var(--header-control-bg)]"
                            >
                                {renderHighlightedText(brand.name, searchQuery)}
                            </button>
                        ))}
                        {searchResults.map((item) => {
                            const title = headerSearchProductTitle(item);
                            return (
                                <button
                                    key={`sheet-product-${item.id}`}
                                    type="button"
                                    onClick={() => onProductSelectAction(item.slug)}
                                    className="block w-full rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-[var(--header-control-bg)]"
                                >
                                    {item.matched_code ? (
                                        <div className="truncate text-[11px] font-medium text-admin-primary">
                                            {renderHighlightedText(item.matched_code, searchQuery)}
                                        </div>
                                    ) : null}
                                    <div className="truncate text-sm font-medium text-admin-text">
                                        {renderHighlightedText(title, searchQuery, {
                                            brandName: item.brand_name,
                                        })}
                                    </div>
                                    <div className="truncate text-xs text-admin-text-secondary">
                                        {formatSearchPrice(item)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-admin-border px-3 py-3">
                <button type="button" className={`${siteBtnSecondary} min-h-12 w-full`} onClick={onCloseAction}>
                    Закрыть
                </button>
            </div>
        </div>,
        document.body,
    );
}
