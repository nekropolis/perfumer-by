"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatSearchPrice } from "@/components/layout/header/format-search-price";
import { renderHighlightedText } from "@/components/layout/header/render-highlighted-text";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";
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

type ViewportBox = {
    top: number;
    height: number;
};

function readPhoneViewport(): ViewportBox {
    const vv = window.visualViewport;
    if (!vv) {
        return { top: 0, height: window.innerHeight };
    }

    return { top: vv.offsetTop, height: vv.height };
}

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
    const [isPhone, setIsPhone] = useState(false);
    const [viewport, setViewport] = useState<ViewportBox>({ top: 0, height: 0 });

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

        const update = () => setViewport(readPhoneViewport());
        update();
        window.visualViewport?.addEventListener("resize", update);
        window.visualViewport?.addEventListener("scroll", update);
        window.addEventListener("resize", update);

        return () => {
            window.visualViewport?.removeEventListener("resize", update);
            window.visualViewport?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [open, isPhone]);

    useEffect(() => {
        if (!open || !isPhone) {
            return;
        }

        const body = document.body;
        const html = document.documentElement;
        const scrollY = window.scrollY;
        const previous = {
            bodyOverflow: body.style.overflow,
            bodyPosition: body.style.position,
            bodyTop: body.style.top,
            bodyLeft: body.style.left,
            bodyWidth: body.style.width,
            htmlOverflow: html.style.overflow,
        };

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = "0";
        body.style.width = "100%";

        return () => {
            body.style.overflow = previous.bodyOverflow;
            body.style.position = previous.bodyPosition;
            body.style.top = previous.bodyTop;
            body.style.left = previous.bodyLeft;
            body.style.width = previous.bodyWidth;
            html.style.overflow = previous.htmlOverflow;
            window.scrollTo({ top: scrollY, behavior: "auto" });
        };
    }, [open, isPhone]);

    if (!open || !isPhone || typeof document === "undefined") {
        return null;
    }

    const query = searchQuery.trim();
    const keyboardInset = viewport.height > 0
        ? Math.max(0, window.innerHeight - viewport.top - viewport.height)
        : 0;
    const liftedByKeyboard = keyboardInset > 80;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск"
            className="fixed inset-x-0 z-[145] flex flex-col bg-admin-surface md:hidden"
            style={{
                top: viewport.top,
                bottom: liftedByKeyboard ? keyboardInset : "var(--storefront-tab-bar-height, 0px)",
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
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
                                            className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-admin-text"
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
                                            className="rounded-full border border-admin-border bg-admin-surface px-3 py-1.5 text-sm text-admin-text-secondary"
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
                                className="mt-2 rounded-2xl border border-admin-border px-2.5 py-1.5 text-left text-sm text-admin-text"
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
                                className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-admin-text"
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
                                    className="block w-full rounded-2xl px-3 py-2.5 text-left"
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
