"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import HeaderMobileMenu from "@/components/layout/header/mobile-menu";
import HeaderCatalogDrawer from "@/components/layout/header/catalog-drawer";
import HeaderMainRow from "@/components/layout/header/header-main-row";
import HeaderNav from "@/components/layout/header/header-nav";
import HeaderServiceBar from "@/components/layout/header/header-service-bar";
import { useHeaderSearch } from "@/components/layout/header/use-header-search";
import type { HeaderSearchItem } from "@/components/layout/header/types";
import {
    HEADER_CATALOG_DRAWER_SECTIONS,
    HEADER_CATALOG_TRIGGER,
    PHONE_NUMBERS,
    HEADER_CONTACT_LINKS,
    HEADER_MESSENGER_LINKS,
    HEADER_PHONE_DROPDOWN_LINKS,
    HEADER_PHONE_SHORT_LABEL,
    HEADER_POPULAR_SEARCHES,
    HEADER_SECONDARY_LINKS,
} from "@/components/layout/header/config";
import { fetchSiteContent } from "@/lib/site-content-api";

function formatSearchPrice(item: HeaderSearchItem): ReactNode {
    const min = item.price_range?.min ?? null;
    const max = item.price_range?.max ?? null;
    const stockTotal = item.stock_total ?? 0;
    /** Как в каталоге: `stock_total` и флаг `is_out_of_stock` согласованы с каналом поставщика (см. syncProductStockFlagsByProductId). */
    const listingAvailable = stockTotal > 0 || item.is_preorder_available;
    const awaitingArrival =
        !listingAvailable &&
        (Boolean(item.is_out_of_stock) || Boolean(min || max));

    if (item.is_preorder_available && !min && !max) {
        return "Предзаказ";
    }

    if (!min && !max) {
        if (awaitingArrival) {
            return "Ожидается поступление";
        }
        return "Цена уточняется";
    }

    const normalize = (value: string | null) =>
        value ? value.replace(".", ",") : null;

    const nMin = normalize(min);
    const nMax = normalize(max);

    const priceBlock =
        nMin && nMax && nMin !== nMax ? (
            <strong>
                {nMin} - {nMax} <small>BYN</small>
            </strong>
        ) : (
            <strong>
                {nMin || nMax} <small>BYN</small>
            </strong>
        );

    if (awaitingArrival) {
        return (
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {priceBlock}
                <span className="font-normal text-[var(--text-secondary)]">
                    · Ожидается поступление
                </span>
            </span>
        );
    }

    return priceBlock;
}

function formatMinskFreeDeliveryPromo(threshold: number): string {
    const n = Number.isFinite(threshold) ? threshold : 50;
    return `Бесплатная доставка по Минску от ${n} BYN`;
}

export default function Header() {
    const [promoText, setPromoText] = useState(() => formatMinskFreeDeliveryPromo(50));
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [menuTopOffset, setMenuTopOffset] = useState(64);

    const headerRef = useRef<HTMLElement | null>(null);
    const { cartQty } = useCart();
    const { wishlistQty } = useWishlist();
    const { user, isAuthenticated, logout } = useAuth();

    const accountRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const phoneDropdownRef = useRef<HTMLDivElement | null>(null);
    const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
    const {
        searchOpen,
        setSearchOpen,
        searchQuery,
        searchLoading,
        searchResults,
        searchBrandResults,
        recentSearches,
        resetSearch,
        handleSearchChange,
        submitSearchPage,
        clearRecentSearches,
        handleSelectProduct,
        handleSelectBrand,
        selectSuggestion,
    } = useHeaderSearch({
        onAfterNavigateAction: () => setIsMobileOpen(false),
    });

    useEffect(() => {
        let cancelled = false;
        void fetchSiteContent()
            .then((res) => {
                if (!cancelled) {
                    setPromoText(
                        formatMinskFreeDeliveryPromo(res.data.delivery_minsk_free_threshold),
                    );
                }
            })
            .catch(() => {
                /* оставляем строку по умолчанию */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                accountRef.current &&
                !accountRef.current.contains(event.target as Node)
            ) {
                setIsAccountOpen(false);
            }

            if (
                phoneDropdownRef.current &&
                !phoneDropdownRef.current.contains(event.target as Node)
            ) {
                setIsPhoneDropdownOpen(false);
            }

            if (
                searchRef.current &&
                !searchRef.current.contains(event.target as Node)
            ) {
                setSearchOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [setSearchOpen]);

    useEffect(() => {
        const measure = () => {
            const next = headerRef.current?.offsetHeight ?? 64;
            setMenuTopOffset(next);
        };

        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [isCompact, isPhoneDropdownOpen, isMobileOpen]);

    useEffect(() => {
        if (!isMobileOpen) {
            return;
        }

        const body = document.body;
        const html = document.documentElement;
        const scrollY = window.scrollY;
        const bodyStyle = body.style;
        const htmlStyle = html.style;
        const previous = {
            bodyOverflow: bodyStyle.overflow,
            bodyPosition: bodyStyle.position,
            bodyTop: bodyStyle.top,
            bodyLeft: bodyStyle.left,
            bodyRight: bodyStyle.right,
            bodyWidth: bodyStyle.width,
            bodyOverscrollBehavior: bodyStyle.overscrollBehavior,
            htmlOverflowX: htmlStyle.overflowX,
            bodyOverflowX: bodyStyle.overflowX,
        };

        bodyStyle.overflow = "hidden";
        bodyStyle.position = "fixed";
        bodyStyle.top = `-${scrollY}px`;
        bodyStyle.left = "0";
        bodyStyle.right = "0";
        bodyStyle.width = "100%";
        bodyStyle.overscrollBehavior = "none";
        htmlStyle.overflowX = "clip";
        bodyStyle.overflowX = "clip";

        return () => {
            bodyStyle.overflow = previous.bodyOverflow;
            bodyStyle.position = previous.bodyPosition;
            bodyStyle.top = previous.bodyTop;
            bodyStyle.left = previous.bodyLeft;
            bodyStyle.right = previous.bodyRight;
            bodyStyle.width = previous.bodyWidth;
            bodyStyle.overscrollBehavior = previous.bodyOverscrollBehavior;
            htmlStyle.overflowX = previous.htmlOverflowX;
            bodyStyle.overflowX = previous.bodyOverflowX;
            window.scrollTo({ top: scrollY, behavior: "auto" });
        };
    }, [isMobileOpen]);

    useEffect(() => {
        if (!isMobileOpen) {
            return;
        }

        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setIsMobileOpen(false);
                resetSearch();
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isMobileOpen, resetSearch]);

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
        document.addEventListener("scroll", onScroll, {
            passive: true,
            capture: true,
        });
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

        if (isMobileOpen) {
            resetSearch();
        } else {
            setSearchOpen(false);
        }

        setIsMobileOpen((prev) => !prev);
    };

    return (
        <header
            ref={headerRef}
            className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header-bg)]/95 shadow-sm backdrop-blur"
        >
            <HeaderServiceBar
                isCompact={isCompact}
                promoText={promoText}
                phoneShortLabel={HEADER_PHONE_SHORT_LABEL}
                phoneDropdownLinks={HEADER_PHONE_DROPDOWN_LINKS}
                messengerLinks={HEADER_MESSENGER_LINKS}
                isPhoneDropdownOpen={isPhoneDropdownOpen}
                phoneDropdownRef={phoneDropdownRef}
                onTogglePhoneDropdownAction={() =>
                    setIsPhoneDropdownOpen((prev) => !prev)
                }
                onClosePhoneDropdownAction={() =>
                    setIsPhoneDropdownOpen(false)
                }
                onOpenMessengerAction={openMessengerApp}
            />

            <HeaderMainRow
                searchRef={searchRef}
                desktopSearchInputRef={desktopSearchInputRef}
                accountRef={accountRef}
                catalogTriggerLabel={HEADER_CATALOG_TRIGGER.label}
                searchOpen={searchOpen}
                searchLoading={searchLoading}
                searchQuery={searchQuery}
                searchResults={searchResults}
                searchBrandResults={searchBrandResults}
                recentSearches={recentSearches}
                popularSearches={HEADER_POPULAR_SEARCHES}
                formatSearchPrice={formatSearchPrice}
                wishlistQty={wishlistQty}
                cartQty={cartQty}
                isAuthenticated={isAuthenticated}
                isAccountOpen={isAccountOpen}
                userName={user?.name || "Пользователь"}
                userPhone={user?.phone || ""}
                isMobileOpen={isMobileOpen}
                onOpenCatalogDrawerAction={() => setIsCatalogDrawerOpen(true)}
                onSearchFocusAction={() => setSearchOpen(true)}
                onSearchChangeAction={handleSearchChange}
                onSearchSubmitAction={submitSearchPage}
                onSearchResetAction={resetSearch}
                onClearRecentAction={clearRecentSearches}
                onRecentSelectAction={selectSuggestion}
                onPopularSelectAction={selectSuggestion}
                onBrandSelectAction={handleSelectBrand}
                onProductSelectAction={handleSelectProduct}
                onToggleAccountAction={() => setIsAccountOpen((prev) => !prev)}
                onCloseAccountAction={() => setIsAccountOpen(false)}
                onLogoutAction={() => {
                    logout();
                    setIsAccountOpen(false);
                }}
                onToggleMobileMenuAction={toggleMobileMenu}
            />

            <HeaderNav isCompact={isCompact} links={HEADER_SECONDARY_LINKS} />

            <HeaderMobileMenu
                isOpen={isMobileOpen}
                topOffset={menuTopOffset}
                searchOpen={searchOpen}
                searchLoading={searchLoading}
                searchQuery={searchQuery}
                searchResults={searchResults}
                searchBrandResults={searchBrandResults}
                recentSearches={recentSearches}
                popularSearches={HEADER_POPULAR_SEARCHES}
                phoneLinks={PHONE_NUMBERS}
                contactLinks={HEADER_CONTACT_LINKS}
                isAuthenticated={isAuthenticated}
                userName={user?.name || "Пользователь"}
                userPhone={user?.phone || ""}
                formatSearchPriceAction={formatSearchPrice}
                onCloseAction={() => {
                    resetSearch();
                    setIsMobileOpen(false);
                }}
                onSearchFocusAction={() => setSearchOpen(true)}
                onSearchChangeAction={handleSearchChange}
                onSearchSubmitAction={submitSearchPage}
                onSearchResetAction={resetSearch}
                onClearRecentAction={clearRecentSearches}
                onRecentSelectAction={selectSuggestion}
                onPopularSelectAction={selectSuggestion}
                onBrandSelectAction={handleSelectBrand}
                onProductSelectAction={handleSelectProduct}
                onLogoutAction={() => {
                    logout();
                    resetSearch();
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