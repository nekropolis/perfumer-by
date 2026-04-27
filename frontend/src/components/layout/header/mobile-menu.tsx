"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { type RefObject } from "react";
import { createPortal } from "react-dom";
import type {
    HeaderSearchBrandItem,
    HeaderSearchItem,
} from "@/components/layout/header/types";
import ProductStatusLabels from "@/components/product/product-status-labels";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import { renderHighlightedText } from "@/components/layout/header/render-highlighted-text";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { formatSearchPrice } from "@/components/layout/header/format-search-price";

type Props = {
    isOpen: boolean;
    topOffset: number;
    searchOpen: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: HeaderSearchItem[];
    searchBrandResults: HeaderSearchBrandItem[];
    recentSearches: string[];
    popularSearches: readonly string[];
    contactLinks?: ReadonlyArray<{ label: string; href: string }>;
    phoneLinks?: ReadonlyArray<{ label: string; number: string }>;
    isAuthenticated: boolean;
    userName: string;
    userPhone: string;
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
    /** Root of portaled menu — parent uses this to ignore “click outside” for desktop search ref. */
    menuRootRef?: RefObject<HTMLDivElement | null>;
};

export default function HeaderMobileMenu({
    isOpen,
    topOffset,
    searchOpen,
    searchLoading,
    searchQuery,
    searchResults,
    searchBrandResults,
    recentSearches,
    popularSearches,
    phoneLinks = [],
    contactLinks = [],
    isAuthenticated,
    userName,
    userPhone,
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
    menuRootRef,
}: Props) {
    if (!isOpen || typeof window === "undefined") {
        return null;
    }

    const getOperatorBadgeClass = (label: string) => {
        const normalized = label.toLowerCase();
        if (normalized.includes("мтс")) {
            return "bg-red-50 text-red-700 border-red-100";
        }
        if (normalized.includes("life")) {
            return "bg-amber-50 text-amber-700 border-amber-100";
        }
        return "bg-violet-50 text-violet-700 border-violet-100";
    };

    return createPortal(
        <div
            ref={menuRootRef}
            className="fixed inset-x-0 bottom-0 z-50 overflow-x-clip border-t border-[var(--line)] bg-[var(--surface)] md:hidden"
            style={{ top: `${topOffset}px` }}
        >
            <div className="h-full overflow-y-auto overscroll-contain">
                <div className="mx-auto max-w-7xl px-4 py-4 pb-6 sm:px-6">
                    <div className="flex flex-col gap-3">
                    <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="relative">
                            <Search
                                size={15}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                            />
                            <input
                                value={searchQuery}
                                onFocus={onSearchFocusAction}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        onSearchSubmitAction();
                                    }
                                }}
                                onChange={(e) =>
                                    onSearchChangeAction(e.target.value)
                                }
                                placeholder="Товары, бренды, код или артикул…"
                                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--background)] py-2.5 pl-9 pr-9 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)] focus:bg-white"
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    onClick={onSearchResetAction}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-secondary)] transition hover:bg-[#F5EFF8] hover:text-[var(--accent)]"
                                    aria-label="Сбросить поиск"
                                    title="Сбросить поиск"
                                >
                                    <X size={14} />
                                </button>
                            ) : null}
                        </div>

                        {searchOpen ? (
                            <div className="mt-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-2">
                                {searchLoading ? (
                                    <div className="px-3 py-3 text-sm text-[var(--text-secondary)]">
                                        Поиск...
                                    </div>
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
                                                            key={`recent-mobile-${item}`}
                                                            type="button"
                                                            onClick={() =>
                                                                onRecentSelectAction(
                                                                    item,
                                                                )
                                                            }
                                                            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                                        >
                                                            {renderHighlightedText(
                                                                item,
                                                                searchQuery,
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-[var(--text-secondary)]">
                                                    Пока пусто
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                                Популярное
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {popularSearches.map((item) => (
                                                    <button
                                                        key={`popular-mobile-${item}`}
                                                        type="button"
                                                        onClick={() =>
                                                            onPopularSelectAction(
                                                                item,
                                                            )
                                                        }
                                                        className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                                                    >
                                                        {item}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : searchBrandResults.length === 0 &&
                                    searchResults.length === 0 ? (
                                    <div className="px-3 py-3 text-sm text-[var(--text-secondary)]">
                                        Ничего не найдено
                                    </div>
                                ) : (
                                    <div className="max-h-72 overflow-y-auto">
                                        {searchBrandResults.length > 0 ? (
                                            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                                Бренды
                                            </div>
                                        ) : null}

                                        {searchBrandResults.map((brand) => (
                                            <button
                                                key={`mobile-brand-${brand.id}`}
                                                type="button"
                                                onClick={() =>
                                                    onBrandSelectAction(
                                                        brand.slug,
                                                    )
                                                }
                                                className="block w-full rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--background)]"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                                        {renderHighlightedText(
                                                            brand.name,
                                                            searchQuery,
                                                        )}
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
                                            return (
                                            <button
                                                key={`mobile-${item.id}`}
                                                type="button"
                                                onClick={() =>
                                                    onProductSelectAction(
                                                        item.slug,
                                                    )
                                                }
                                                className="block w-full rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--background)]"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                                                        <ProductStatusLabels
                                                            isNew={Boolean(item.is_new)}
                                                            isHit={Boolean(item.is_hit)}
                                                            hasDiscount={Boolean(item.has_discount)}
                                                            className="left-1 top-1 scale-90 origin-top-left"
                                                        />
                                                        {imageSrc ? (
                                                            <Image
                                                                src={imageSrc}
                                                                loader={productImageLoader}
                                                                alt={item.name}
                                                                fill
                                                                sizes="48px"
                                                                className="object-cover"
                                                            />
                                                        ) : null}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                                            {renderHighlightedText(
                                                                item.name,
                                                                searchQuery,
                                                            )}
                                                        </div>
                                                        <div className="truncate text-xs text-[var(--text-secondary)]">
                                                            {formatSearchPrice(
                                                                item,
                                                            )}
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

                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            href="/catalog"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Каталог
                        </Link>

                        <Link
                            href="/brands"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Бренды
                        </Link>

                        <Link
                            href="/catalog?sort=new"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Новинки
                        </Link>

                        <Link
                            href="/catalog?sale=1"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Акции
                        </Link>

                        <Link
                            href="/reviews"
                            className="col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Отзывы о магазине
                        </Link>

                        <Link
                            href="/news"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Новости
                        </Link>

                        <Link
                            href="/articles"
                            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white hover:text-[var(--accent)]"
                            onClick={onCloseAction}
                        >
                            Статьи
                        </Link>
                    </div>

                    {isAuthenticated ? (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-2">
                            <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                    {userName}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {userPhone}
                                </div>
                            </div>

                            <Link
                                href="/account"
                                className="mt-2 block rounded-2xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onCloseAction}
                            >
                                Личный кабинет
                            </Link>

                            <button
                                type="button"
                                className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                onClick={onLogoutAction}
                            >
                                Выйти
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-2">
                            <Link
                                href="/login"
                                className="block rounded-2xl px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] hover:text-[var(--accent)]"
                                onClick={onCloseAction}
                            >
                                Войти
                            </Link>
                        </div>
                    )}

                    {contactLinks.length > 0 ? (
                        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                Связаться с нами
                            </div>

                            <div className="flex flex-col gap-1">
                                {phoneLinks.map((phone) => (
                                    <a
                                        key={phone.number}
                                        href={`tel:${phone.number}`}
                                        className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-white"
                                    >
                                        <span
                                            className={`inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getOperatorBadgeClass(phone.label)}`}
                                        >
                                            {phone.label}
                                        </span>
                                        <span className="font-medium">{phone.number}</span>
                                    </a>
                                ))}

                                {contactLinks.map((item) => (
                                    <a
                                        key={item.href}
                                        href={item.href}
                                        className="rounded-2xl px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                                    >
                                        {item.label}
                                    </a>
                                ))}

                                <div className="pt-1">
                                    <CallbackRequestTrigger className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-emerald-700 transition hover:bg-[var(--background)]" />
                                </div>
                            </div>
                        </div>
                    ) : null}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}