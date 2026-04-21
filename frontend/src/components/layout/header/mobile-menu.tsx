"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";

type Props = {
    isOpen: boolean;
    searchOpen: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    recentSearches: string[];
    popularSearches: readonly string[];
    contactLinks?: ReadonlyArray<{ label: string; href: string }>;
    cartQty: number;
    wishlistQty?: number;
    isAuthenticated: boolean;
    userName: string;
    userPhone: string;
    formatSearchPrice: (item: HeaderSearchItem) => ReactNode;
    onCloseAction: () => void;
    onSearchFocusAction: () => void;
    onSearchChangeAction: (value: string) => void;
    onSearchSubmitAction: () => void;
    onSearchResetAction: () => void;
    onClearRecentAction: () => void;
    onRecentSelectAction: (value: string) => void;
    onPopularSelectAction: (value: string) => void;
    onBrandSelectAction: (slug: string) => void;
    onProductSelectAction: (slug: string) => void;
    onLogoutAction: () => void;
};

function renderHighlightedText(text: string, query: string): ReactNode {
    const needle = query.trim();
    if (!needle) {
        return text;
    }

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    const parts = text.split(regex);

    return parts.map((part, index) => {
        const isMatch = part.toLowerCase() === needle.toLowerCase();
        if (!isMatch) {
            return <span key={`${part}-${index}`}>{part}</span>;
        }
        return (
            <mark key={`${part}-${index}`} className="rounded bg-yellow-100 px-0.5 text-inherit">
                {part}
            </mark>
        );
    });
}

export default function HeaderMobileMenu({
    isOpen,
    searchOpen,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    recentSearches,
    popularSearches,
    contactLinks = [],
    cartQty,
    wishlistQty = 0,
    isAuthenticated,
    userName,
    userPhone,
    formatSearchPrice,
    onCloseAction,
    onSearchFocusAction,
    onSearchChangeAction,
    onSearchSubmitAction,
    onSearchResetAction,
    onClearRecentAction,
    onRecentSelectAction,
    onPopularSelectAction,
    onBrandSelectAction,
    onProductSelectAction,
    onLogoutAction,
}: Props) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="border-t bg-white md:hidden">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-2">
                    <div className="relative mb-1">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={searchQuery}
                            onFocus={onSearchFocusAction}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    onSearchSubmitAction();
                                }
                            }}
                            onChange={(e) => onSearchChangeAction(e.target.value)}
                            placeholder="Поиск по товарам..."
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-gray-400 focus:bg-white"
                        />
                        {searchQuery ? (
                            <button
                                type="button"
                                onClick={onSearchResetAction}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition hover:bg-gray-200/60 hover:text-gray-700"
                                aria-label="Сбросить поиск"
                                title="Сбросить поиск"
                            >
                                <X size={14} />
                            </button>
                        ) : null}
                    </div>

                    {searchOpen ? (
                        <div className="mb-2 rounded-2xl border bg-white p-2">
                            {searchLoading ? (
                                <div className="px-3 py-3 text-sm text-gray-500">Поиск...</div>
                            ) : searchQuery.trim().length < 2 ? (
                                <div className="space-y-3 px-3 py-3">
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                            <span>Последние запросы</span>
                                            <button
                                                type="button"
                                                onClick={onClearRecentAction}
                                                className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                                            >
                                                Очистить
                                            </button>
                                        </div>
                                        {recentSearches.length > 0 ? (
                                            <div className="space-y-0.5">
                                                {recentSearches.map((item) => (
                                                    <button
                                                        key={`recent-mobile-${item}`}
                                                        type="button"
                                                        onClick={() => onRecentSelectAction(item)}
                                                        className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-800 transition hover:bg-gray-50"
                                                    >
                                                        {renderHighlightedText(item, searchQuery)}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-400">Пока пусто</div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                            Популярное
                                        </div>
                                        <div className="space-y-0.5">
                                            {popularSearches.map((item) => (
                                                <button
                                                    key={`popular-mobile-${item}`}
                                                    type="button"
                                                    onClick={() => onPopularSelectAction(item)}
                                                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-800 transition hover:bg-gray-50"
                                                >
                                                    {renderHighlightedText(item, searchQuery)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : searchBrandResults.length === 0 && searchResults.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-gray-500">Ничего не найдено</div>
                            ) : (
                                <div className="max-h-64 overflow-y-auto">
                                    {searchBrandResults.length > 0 ? (
                                        <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Бренды</div>
                                    ) : null}
                                    {searchBrandResults.map((brand) => (
                                        <button
                                            key={`mobile-brand-${brand.id}`}
                                            type="button"
                                            onClick={() => onBrandSelectAction(brand.slug)}
                                            className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-gray-50"
                                        >
                                            <div className="flex items-center gap-2">
                                            <div className="truncate text-sm font-medium text-gray-900">
                                                {renderHighlightedText(brand.name, searchQuery)}
                                            </div>
                                                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-700">
                                                    {brand.products_count}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                    {searchResults.length > 0 ? (
                                        <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Товары</div>
                                    ) : null}
                                    {searchResults.map((item) => (
                                        <button
                                            key={`mobile-${item.id}`}
                                            type="button"
                                            onClick={() => onProductSelectAction(item.slug)}
                                            className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-gray-50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-gray-50">
                                                    {item.image ? (
                                                        <Image
                                                            src={item.image.startsWith("http") ? item.image : `/${item.image.replace(/^\/+/, "")}`}
                                                            alt={item.name}
                                                            fill
                                                            sizes="48px"
                                                            className="object-cover"
                                                            unoptimized
                                                        />
                                                    ) : null}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-gray-900">
                                                        {renderHighlightedText(item.name, searchQuery)}
                                                    </div>
                                                    <div className="truncate text-xs text-gray-600">
                                                        {formatSearchPrice(item)}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    <Link
                        href="/catalog"
                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                        onClick={onCloseAction}
                    >
                        Каталог
                    </Link>

                    <Link
                        href="/catalog?sort=new"
                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                        onClick={onCloseAction}
                    >
                        Новинки
                    </Link>

                    <Link
                        href="/catalog?sale=1"
                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                        onClick={onCloseAction}
                    >
                        Акции
                    </Link>

                    <Link
                        href="/wishlist"
                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                        onClick={onCloseAction}
                    >
                        Избранное {wishlistQty > 0 ? `(${wishlistQty})` : ""}
                    </Link>

                    {contactLinks.length > 0 ? (
                        <div className="mt-1 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Связаться с нами
                            </div>
                            <div className="flex flex-col gap-1">
                                {contactLinks.map((item) => (
                                    <a
                                        key={item.href}
                                        href={item.href}
                                        className="text-sm font-medium text-gray-700 transition hover:text-black"
                                    >
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <Link
                        href="/cart"
                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                        onClick={onCloseAction}
                    >
                        Корзина {cartQty > 0 ? `(${cartQty})` : ""}
                    </Link>

                    {isAuthenticated ? (
                        <>
                            <div className="mt-2 rounded-2xl bg-gray-50 px-3 py-3">
                                <div className="text-sm font-medium text-black">{userName}</div>
                                <div className="mt-1 text-xs text-gray-500">{userPhone}</div>
                            </div>

                            <Link
                                href="/account"
                                className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <button
                                type="button"
                                className="rounded-2xl px-3 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={onLogoutAction}
                            >
                                Выйти
                            </button>
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                            onClick={onCloseAction}
                        >
                            Войти
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
