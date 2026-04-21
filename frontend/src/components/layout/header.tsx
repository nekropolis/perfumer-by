"use client";

import Link from "next/link";
import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { apiFetch } from "@/lib/api";
import HeaderMobileMenu from "@/components/layout/header/mobile-menu";
import HeaderAccountMenu from "@/components/layout/header/account-menu";
import HeaderCatalogDrawer from "@/components/layout/header/catalog-drawer";
import type { HeaderSearchBrandItem, HeaderSearchItem } from "@/components/layout/header/types";
import { resolveProductStatuses } from "@/lib/product-statuses";
import {
    HEADER_CATALOG_DRAWER_SECTIONS,
    HEADER_CATALOG_TRIGGER,
    HEADER_CONTACT_LINKS,
    HEADER_MESSENGER_LINKS,
    HEADER_PHONE_DROPDOWN_LINKS,
    HEADER_PHONE_SHORT_LABEL,
    HEADER_POPULAR_SEARCHES,
    HEADER_PROMO_TEXT,
    HEADER_SECONDARY_LINKS,
} from "@/components/layout/header/config";

type HeaderSearchResponse = {
    data: {
        brands: HeaderSearchBrandItem[];
        products: HeaderSearchItem[];
    };
};

const RECENT_SEARCHES_STORAGE_KEY = "perfumer_recent_searches";

function readRecentSearches(): string[] {
    if (typeof window === "undefined") {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .slice(0, 8);
    } catch {
        return [];
    }
}

function formatSearchPrice(item: HeaderSearchItem): ReactNode {
    const min = item.price_range?.min ?? null;
    const max = item.price_range?.max ?? null;

    if (!min && !max) {
        return item.is_out_of_stock && !item.is_preorder_available ? "Нет в наличии" : "Цена уточняется";
    }

    const normalize = (value: string | null) => (value ? value.replace(".", ",") : null);
    const nMin = normalize(min);
    const nMax = normalize(max);

    if (nMin && nMax && nMin !== nMax) {
        return (
            <>
                <strong>{nMin} - {nMax} <small>BYN</small></strong>
            </>
        );
    }

    return (
        <>
            <strong>{nMin || nMax} <small>BYN</small></strong>
        </>
    );
}

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

export default function Header() {
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<HeaderSearchItem[]>([]);
    const [searchBrandResults, setSearchBrandResults] = useState<HeaderSearchBrandItem[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const { cartQty } = useCart();
    const { wishlistQty } = useWishlist();
    const { user, isAuthenticated, logout } = useAuth();

    const accountRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const phoneDropdownRef = useRef<HTMLDivElement | null>(null);
    const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
                setIsAccountOpen(false);
            }
            if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(event.target as Node)) {
                setIsPhoneDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setRecentSearches(readRecentSearches());
        }, 0);
        return () => {
            window.clearTimeout(timerId);
        };
    }, []);

    useEffect(() => {
        const COMPACT_ON_SCROLL_Y = 24;
        const COMPACT_OFF_SCROLL_Y = 2;
        let rafId = 0;
        let upIntentUntil = 0;
        let touchStartY = 0;

        const getScrollTop = () => {
            if (typeof window === "undefined") {
                return 0;
            }
            const scrollingElement = document.scrollingElement;
            const fromWindow = window.scrollY || 0;
            const fromDocument = scrollingElement ? scrollingElement.scrollTop : 0;
            return Math.max(fromWindow, fromDocument);
        };

        const onScroll = () => {
            if (rafId) {
                return;
            }
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                const top = getScrollTop();
                const now = Date.now();

                setIsCompact((prev) => {
                    if (!prev && top >= COMPACT_ON_SCROLL_Y) {
                        return true;
                    }
                    if (prev && top <= COMPACT_OFF_SCROLL_Y && now <= upIntentUntil) {
                        return false;
                    }
                    return prev;
                });
            });
        };

        const onWheel = (event: WheelEvent) => {
            if (event.deltaY < 0) {
                upIntentUntil = Date.now() + 300;
            }
        };

        const onTouchStart = (event: TouchEvent) => {
            touchStartY = event.touches[0]?.clientY ?? 0;
        };

        const onTouchMove = (event: TouchEvent) => {
            const currentY = event.touches[0]?.clientY ?? 0;
            if (currentY > touchStartY) {
                upIntentUntil = Date.now() + 300;
            }
            touchStartY = currentY;
        };

        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("scroll", onScroll, { passive: true, capture: true });
        window.addEventListener("resize", onScroll);
        window.addEventListener("wheel", onWheel, { passive: true });
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            document.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onScroll);
            window.removeEventListener("wheel", onWheel);
            window.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchmove", onTouchMove);
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, []);

    useEffect(() => {
        const query = searchQuery.trim();
        if (!searchOpen || query.length < 2) {
            return;
        }

        let cancelled = false;
        const timeoutId = setTimeout(() => {
            void apiFetch<HeaderSearchResponse>(`/catalog/products/smart-search?q=${encodeURIComponent(query)}&limit=8`)
                .then((res) => {
                    if (!cancelled) {
                        setSearchBrandResults(res.data?.brands ?? []);
                        setSearchResults(res.data?.products ?? []);
                    }
                })
                .catch((e) => {
                    if (!cancelled) {
                        console.error(e);
                        setSearchBrandResults([]);
                        setSearchResults([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setSearchLoading(false);
                    }
                });
        }, 260);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [searchOpen, searchQuery]);

    const handleSelectProduct = (slug: string) => {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchBrandResults([]);
        setSearchResults([]);
        setIsMobileOpen(false);
        router.push(`/product/${slug}`);
    };

    const handleSelectBrand = (slug: string) => {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchBrandResults([]);
        setSearchResults([]);
        setIsMobileOpen(false);
        router.push(`/catalog?brand_slug=${encodeURIComponent(slug)}`);
    };

    const resetSearch = () => {
        setSearchQuery("");
        setSearchLoading(false);
        setSearchBrandResults([]);
        setSearchResults([]);
        setSearchOpen(false);
    };

    const submitSearchPage = () => {
        const query = searchQuery.trim();
        if (!query) {
            return;
        }
        const nextRecent = [query, ...recentSearches.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 8);
        setRecentSearches(nextRecent);
        try {
            window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(nextRecent));
        } catch {
            // ignore storage write errors
        }
        setSearchOpen(false);
        setIsMobileOpen(false);
        router.push(`/search?query=${encodeURIComponent(query)}`);
    };

    const clearRecentSearches = () => {
        setRecentSearches([]);
        try {
            window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
        } catch {
            // ignore storage errors
        }
    };

    const openMessengerApp = (appHref: string, webHref: string) => {
        if (typeof window === "undefined") {
            return;
        }
        window.open(appHref, "_blank", "noopener,noreferrer");
        window.setTimeout(() => {
            if (document.visibilityState === "visible") {
                window.open(webHref, "_blank", "noopener,noreferrer");
            }
        }, 450);
    };

    const toggleMobileMenu = () => {
        setIsCatalogDrawerOpen(false);
        setIsMobileOpen((prev) => !prev);
    };

    const openDesktopSearch = () => {
        setSearchOpen(true);
        window.setTimeout(() => {
            desktopSearchInputRef.current?.focus();
        }, 0);
    };

    return (
        <header className="sticky top-0 z-40 border-b bg-white shadow-sm">
            <div
                className={`hidden bg-gray-50 text-gray-700 transition-[max-height,opacity,border-color] duration-250 ease-out md:block ${isCompact ? "max-h-0 overflow-hidden border-b border-transparent opacity-0" : "max-h-8 border-b opacity-100"
                    }`}
                aria-hidden={isCompact}
            >
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-8 items-center justify-between text-xs">
                        <div className="truncate">{HEADER_PROMO_TEXT}</div>
                        <div className="flex items-center gap-2 text-gray-600">
                            <div className="relative" ref={phoneDropdownRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 transition hover:text-black"
                                    onClick={() => setIsPhoneDropdownOpen((prev) => !prev)}
                                >
                                    <span>{HEADER_PHONE_SHORT_LABEL}</span>
                                    <span className="text-[10px] text-gray-500">МТС / A1 / life</span>
                                    <svg
                                        aria-hidden
                                        viewBox="0 0 20 20"
                                        className={`h-3.5 w-3.5 text-gray-500 transition-transform duration-200 ${isPhoneDropdownOpen ? "rotate-180" : ""}`}
                                        fill="none"
                                    >
                                        <path
                                            d="M5.5 7.5L10 12l4.5-4.5"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </button>
                                {isPhoneDropdownOpen && (
                                    <div className="absolute right-0 top-7 z-50 w-60 rounded-xl border bg-white p-1.5 shadow-lg">
                                        {HEADER_PHONE_DROPDOWN_LINKS.map((item) => (
                                            <a
                                                key={item.href}
                                                href={item.href}
                                                className="block rounded-lg px-2.5 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                                onClick={() => setIsPhoneDropdownOpen(false)}
                                            >
                                                {item.label}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {HEADER_MESSENGER_LINKS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-105 ${item.id === "telegram"
                                        ? "bg-[#27A6E5]/10 text-[#27A6E5] hover:bg-[#27A6E5]/15"
                                        : "bg-[#7360F2]/10 text-[#7360F2] hover:bg-[#7360F2]/15"
                                        }`}
                                    onClick={() => openMessengerApp(item.appHref, item.webHref)}
                                    title={item.label}
                                    aria-label={item.label}
                                >
                                    {item.id === "telegram" ? (
                                        <svg
                                            aria-hidden
                                            viewBox="0 0 24 24"
                                            className="h-4 w-4"
                                            fill="currentColor"
                                        >
                                            <path d="M21.944 4.256a1.5 1.5 0 0 0-1.74-.275L3.25 11.34a1.5 1.5 0 0 0 .147 2.786l4.441 1.474 1.468 4.62a1.5 1.5 0 0 0 2.648.49l2.472-3.235 4.387 3.216a1.5 1.5 0 0 0 2.335-.876l2.97-14.027a1.5 1.5 0 0 0-.174-1.232ZM10.7 14.553l-.58 3.363-.83-2.612L16.9 8.17l-6.2 6.383Z" />
                                        </svg>
                                    ) : (
                                        <svg
                                            aria-hidden
                                            viewBox="0 0 24 24"
                                            className="h-4 w-4"
                                            fill="currentColor"
                                        >
                                            <path d="M20.75 14.37c-.22-.18-1.3-.95-1.5-1.02-.2-.08-.35-.11-.5.11-.14.22-.58.73-.71.88-.13.15-.26.17-.48.06-.22-.11-.93-.34-1.78-1.08-.66-.58-1.1-1.3-1.23-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.34-.39.11-.13.14-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.69-1.64-.18-.43-.37-.37-.5-.38h-.43c-.15 0-.39.06-.59.28-.2.22-.77.75-.77 1.84 0 1.1.79 2.16.9 2.31.11.15 1.56 2.4 3.78 3.37 2.23.97 2.23.65 2.63.61.39-.04 1.3-.53 1.49-1.04.18-.5.18-.94.13-1.03-.06-.08-.2-.13-.42-.24ZM12.02 2C6.5 2 2 6.34 2 11.68c0 2.2.77 4.21 2.06 5.8L3 22l4.8-1.02a10.2 10.2 0 0 0 4.22.91c5.52 0 10.02-4.34 10.02-9.68S17.54 2 12.02 2Zm0 17.64c-1.3 0-2.57-.31-3.7-.89l-.26-.13-2.85.6.61-2.74-.17-.28a7.2 7.2 0 0 1-1.13-3.87c0-4 3.39-7.26 7.5-7.26 4.14 0 7.52 3.26 7.52 7.26 0 4.01-3.38 7.3-7.52 7.3Z" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4 md:grid md:grid-cols-[240px_minmax(380px,1fr)_auto]">
                    <div className="order-1 flex items-center gap-3 md:order-1">
                        <Link
                            href="/"
                            className="shrink-0 text-xl font-semibold tracking-tight text-black transition hover:opacity-80"
                        >
                            Perfumer
                        </Link>
                        <button
                            type="button"
                            className="hidden rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black md:inline-flex"
                            onClick={() => setIsCatalogDrawerOpen(true)}
                        >
                            {HEADER_CATALOG_TRIGGER.label}
                        </button>
                    </div>

                    <div className="order-3 hidden md:block" />

                    <div className="order-1 ml-auto flex items-center justify-end gap-2 sm:gap-3 md:order-3 md:ml-0 md:justify-end">
                        <div className="relative hidden md:block" ref={searchRef}>
                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={openDesktopSearch}
                                aria-label="Открыть поиск"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    className="h-4 w-4"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </button>

                            {searchOpen && (
                                <div className={`fixed left-0 right-0 z-30 border-y bg-white shadow-lg ${isCompact ? "top-16" : "top-[140px]"}`}>
                                    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
                                        <div className="relative">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                                                />
                                            </svg>
                                            <input
                                                ref={desktopSearchInputRef}
                                                value={searchQuery}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        submitSearchPage();
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setSearchQuery(next);
                                                    setSearchOpen(true);
                                                    if (next.trim().length < 2) {
                                                        setSearchLoading(false);
                                                        setSearchBrandResults([]);
                                                        setSearchResults([]);
                                                    } else {
                                                        setSearchLoading(true);
                                                    }
                                                }}
                                                placeholder="Поиск по товарам, брендам и категориям..."
                                                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-10 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={resetSearch}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition hover:bg-gray-200/60 hover:text-gray-700"
                                                aria-label="Закрыть поиск"
                                            >
                                                ×
                                            </button>
                                        </div>

                                        <div className="mt-2 rounded-2xl border bg-white p-2">
                                            {searchLoading && (
                                                <div className="px-3 pb-1 pt-2 text-xs font-medium text-gray-500">Поиск...</div>
                                            )}
                                            {searchQuery.trim().length < 2 ? (
                                                <div className="space-y-3 px-3 py-3">
                                                    <div>
                                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                                            <span>Последние запросы</span>
                                                            <button
                                                                type="button"
                                                                onClick={clearRecentSearches}
                                                                className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                                                            >
                                                                Очистить
                                                            </button>
                                                        </div>
                                                        {recentSearches.length > 0 ? (
                                                            <div className="space-y-0.5">
                                                                {recentSearches.map((item) => (
                                                                    <button
                                                                        key={`recent-desktop-panel-${item}`}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSearchQuery(item);
                                                                            setSearchLoading(true);
                                                                        }}
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
                                                            {HEADER_POPULAR_SEARCHES.map((item) => (
                                                                <button
                                                                    key={`popular-desktop-panel-${item}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSearchQuery(item);
                                                                        setSearchLoading(true);
                                                                    }}
                                                                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-800 transition hover:bg-gray-50"
                                                                >
                                                                    {renderHighlightedText(item, searchQuery)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : searchBrandResults.length === 0 && searchResults.length === 0 ? (
                                                <div className="px-3 py-4 text-sm text-gray-500">Ничего не найдено</div>
                                            ) : (
                                                <div className="max-h-72 overflow-y-auto">
                                                    {searchBrandResults.length > 0 ? (
                                                        <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Бренды</div>
                                                    ) : null}
                                                    {searchBrandResults.map((brand) => (
                                                        <button
                                                            key={`brand-panel-${brand.id}`}
                                                            type="button"
                                                            onClick={() => handleSelectBrand(brand.slug)}
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
                                                        (() => {
                                                            const statusLabels = resolveProductStatuses({
                                                                isNew: Boolean(item.is_new),
                                                                isHit: Boolean(item.is_hit),
                                                                hasDiscount: Boolean(item.has_discount),
                                                            });

                                                            return (
                                                        <button
                                                            key={`product-panel-${item.id}`}
                                                            type="button"
                                                            onClick={() => handleSelectProduct(item.slug)}
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
                                                                    <div className="truncate text-xs text-gray-600">{formatSearchPrice(item)}</div>
                                                                    {statusLabels.length > 0 ? (
                                                                        <div className="mt-1 flex flex-wrap gap-0.5">
                                                                            {statusLabels.map((status) => (
                                                                                <span
                                                                                    key={`${item.id}-${status.code}`}
                                                                                    className={`inline-flex h-3.5 items-center rounded border px-1 text-[7px] font-semibold leading-none tracking-tight ${status.adminClassName}`}
                                                                                >
                                                                                    {status.shortLabel}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        </button>
                                                            );
                                                        })()
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Link
                            href="/wishlist"
                            className="relative inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                        >
                            <span aria-hidden>♡</span>
                            {wishlistQty > 0 && (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1.5 text-[10px] font-medium text-white">
                                    {wishlistQty}
                                </span>
                            )}
                        </Link>

                        <HeaderAccountMenu
                            accountRef={accountRef}
                            isAuthenticated={isAuthenticated}
                            isAccountOpen={isAccountOpen}
                            userName={user?.name || "Пользователь"}
                            userPhone={user?.phone || ""}
                            onToggleAction={() => setIsAccountOpen((prev) => !prev)}
                            onCloseAction={() => setIsAccountOpen(false)}
                            onLogoutAction={() => {
                                logout();
                                setIsAccountOpen(false);
                            }}
                        />

                        <Link
                            href="/cart"
                            className="relative inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className="h-4 w-4"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M2.25 3h1.386c.51 0 .955.343 1.087.836L5.61 7.5m0 0h12.84c.75 0 1.398.52 1.56 1.252l1.038 4.5a1.125 1.125 0 01-1.098 1.373H7.125a1.125 1.125 0 01-1.098-.877L5.61 7.5zM8.25 19.5a.75.75 0 100 1.5.75.75 0 000-1.5zm10.5 0a.75.75 0 100 1.5.75.75 0 000-1.5z"
                                />
                            </svg>

                            <span className="hidden sm:inline">Корзина</span>

                            {cartQty > 0 && (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1.5 text-[10px] font-medium text-white">
                                    {cartQty}
                                </span>
                            )}
                        </Link>

                        <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white transition hover:bg-gray-50 md:hidden"
                            onClick={toggleMobileMenu}
                            aria-label="Открыть меню"
                        >
                            <span className="text-lg leading-none">
                                {isMobileOpen ? "×" : "☰"}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <div
                className={`hidden transition-[max-height,opacity,border-color] duration-250 ease-out md:block ${isCompact ? "max-h-0 overflow-hidden border-t border-transparent opacity-0" : "max-h-11 border-t opacity-100"
                    }`}
                aria-hidden={isCompact}
            >
                <div className="mx-auto flex h-11 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
                    {HEADER_SECONDARY_LINKS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="text-sm font-medium text-gray-600 transition hover:text-black"
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            </div>

            <HeaderMobileMenu
                isOpen={isMobileOpen}
                searchOpen={searchOpen}
                searchLoading={searchLoading}
                searchQuery={searchQuery}
                searchResults={searchResults}
                searchBrandResults={searchBrandResults}
                recentSearches={recentSearches}
                popularSearches={HEADER_POPULAR_SEARCHES}
                contactLinks={HEADER_CONTACT_LINKS}
                cartQty={cartQty}
                wishlistQty={wishlistQty}
                isAuthenticated={isAuthenticated}
                userName={user?.name || "Пользователь"}
                userPhone={user?.phone || ""}
                formatSearchPrice={formatSearchPrice}
                onCloseAction={() => setIsMobileOpen(false)}
                onSearchFocusAction={() => setSearchOpen(true)}
                onSearchChangeAction={(next) => {
                    setSearchQuery(next);
                    setSearchOpen(true);
                    if (next.trim().length < 2) {
                        setSearchLoading(false);
                        setSearchBrandResults([]);
                        setSearchResults([]);
                    } else {
                        setSearchLoading(true);
                    }
                }}
                onSearchSubmitAction={submitSearchPage}
                onSearchResetAction={resetSearch}
                onClearRecentAction={clearRecentSearches}
                onRecentSelectAction={(item) => {
                    setSearchQuery(item);
                    setSearchLoading(true);
                    setSearchOpen(true);
                }}
                onPopularSelectAction={(item) => {
                    setSearchQuery(item);
                    setSearchLoading(true);
                    setSearchOpen(true);
                }}
                onBrandSelectAction={handleSelectBrand}
                onProductSelectAction={handleSelectProduct}
                onLogoutAction={() => {
                    logout();
                    setIsMobileOpen(false);
                }}
            />

            <HeaderCatalogDrawer
                isOpen={isCatalogDrawerOpen}
                sections={HEADER_CATALOG_DRAWER_SECTIONS}
                onCloseAction={() => setIsCatalogDrawerOpen(false)}
            />
        </header>
    );
}