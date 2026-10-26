"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import MobileTabBar from "@/components/layout/mobile-tab-bar";
import HeaderMainRow from "@/components/layout/header/header-main-row";
import HeaderNav, { HeaderNavFallback } from "@/components/layout/header/header-nav";
import HeaderServiceBar from "@/components/layout/header/header-service-bar";
import MobileSearchSheet from "@/components/layout/header/mobile-search-sheet";
import MobileProfileSheet from "@/components/layout/header/mobile-profile-sheet";
import { useHeaderSearch } from "@/components/layout/header/use-header-search";
import {
    HEADER_BURGER_LINKS,
    HEADER_CATEGORY_PILLS,
    HEADER_MAIN_LINKS,
} from "@/components/layout/header/config";
import { useSiteContent } from "@/components/layout/site-content-context";
import { HEADER_STICKY_EXTENSION_ID } from "@/components/layout/header/constants";
import { withBynSignText } from "@/lib/byn-sign";
import {
    buildHeaderPhoneDropdown,
    buildMessengerLinks,
    phoneNationalShortSuffix,
} from "@/lib/site-contact";

function readLocation(): string {
    return window.location.pathname + window.location.search;
}

function formatMinskFreeDeliveryPromo(threshold: number): string {
    const n = Number.isFinite(threshold) ? threshold : 50;
    return `Бесплатная доставка по Минску от ${withBynSignText(String(n))}`;
}

export default function Header() {
    const pathname = usePathname();
    const showMobileCategoryPills = pathname === "/" || pathname === "/catalog";
    const siteContent = useSiteContent();
    const promoText = formatMinskFreeDeliveryPromo(siteContent.delivery_minsk_free_threshold);
    const phoneShortLabel = phoneNationalShortSuffix(siteContent.contact_phone_mts) || "640-88-33";
    const phoneDropdownLinks = buildHeaderPhoneDropdown(siteContent);
    const messengerLinks = buildMessengerLinks(siteContent);
    const [isBurgerOpen, setIsBurgerOpen] = useState(false);
    const [profileMenuPath, setProfileMenuPath] = useState<string | null>(null);
    const profileMenuOpen = profileMenuPath !== null;
    const closeProfileMenu = useCallback(() => setProfileMenuPath(null), []);
    const syncMenuLocation = useCallback((location: string) => {
        setProfileMenuPath((current) => (current && current !== location ? null : current));
    }, []);

    useLayoutEffect(() => {
        const openedPath = profileMenuPath?.split("?")[0];
        if (openedPath && openedPath !== pathname) {
            setProfileMenuPath(null);
        }
    }, [pathname, profileMenuPath]);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
    const [isMainRowPinned, setIsMainRowPinned] = useState(false);
    const [mainRowHeight, setMainRowHeight] = useState(78);

    const mainRowRef = useRef<HTMLDivElement | null>(null);
    const mainRowSentinelRef = useRef<HTMLDivElement | null>(null);
    const { cartQty } = useCart();
    const { user, isAuthenticated, logout } = useAuth();

    const accountRef = useRef<HTMLDivElement | null>(null);
    const burgerMenuRef = useRef<HTMLDivElement | null>(null);
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
        suggestedQuery,
        recentSearches,
        resetSearch,
        handleSearchChange,
        submitSearchPage,
        clearRecentSearches,
        handleSelectProduct,
        handleSelectBrand,
        selectSuggestion,
    } = useHeaderSearch({
        onAfterNavigateAction: () => {
            setProfileMenuPath(null);
        },
    });

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
                burgerMenuRef.current &&
                !burgerMenuRef.current.contains(event.target as Node)
            ) {
                setIsBurgerOpen(false);
            }

            const isDesktop = window.innerWidth >= 768;
            if (
                isDesktop &&
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
        if (!isAccountOpen && !isBurgerOpen && !isPhoneDropdownOpen && !searchOpen) {
            return;
        }

        // Escape закрывает попапы шапки; если фокус был внутри — возвращаем его на триггер.
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }
            const active = document.activeElement;
            const focusTrigger = (root: HTMLElement | null) => {
                if (root && active instanceof Node && root.contains(active)) {
                    root.querySelector<HTMLElement>("button")?.focus();
                }
            };

            if (isAccountOpen) {
                focusTrigger(accountRef.current);
                setIsAccountOpen(false);
            }
            if (isBurgerOpen) {
                focusTrigger(burgerMenuRef.current);
                setIsBurgerOpen(false);
            }
            if (isPhoneDropdownOpen) {
                focusTrigger(phoneDropdownRef.current);
                setIsPhoneDropdownOpen(false);
            }
            if (searchOpen) {
                const searchRoot = searchRef.current;
                if (searchRoot && active instanceof Node && searchRoot.contains(active)) {
                    desktopSearchInputRef.current?.focus();
                }
                setSearchOpen(false);
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isAccountOpen, isBurgerOpen, isPhoneDropdownOpen, searchOpen, setSearchOpen]);

    useEffect(() => {
        if (!isPhoneDropdownOpen) {
            return;
        }

        const closeOnScroll = () => {
            setIsPhoneDropdownOpen(false);
        };

        window.addEventListener("scroll", closeOnScroll, { passive: true, capture: true });
        return () => {
            window.removeEventListener("scroll", closeOnScroll, { capture: true });
        };
    }, [isPhoneDropdownOpen]);

    useEffect(() => {
        const el = mainRowRef.current;
        if (!el) {
            return;
        }

        const measure = () => {
            const full = el.offsetHeight || 78;
            setMainRowHeight(full);
            const extension = document.getElementById(HEADER_STICKY_EXTENSION_ID);
            const row = Math.max(52, full - (extension?.offsetHeight ?? 0));
            document.documentElement.style.setProperty("--storefront-header-row-height", `${row}px`);
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
            document.documentElement.style.removeProperty("--storefront-header-row-height");
        };
    }, []);

    useEffect(() => {
        const sentinel = mainRowSentinelRef.current;
        if (!sentinel) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsMainRowPinned(!entry.isIntersecting);
            },
            { threshold: 0 },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        // Derive sticky offsets from header height — do not read getBoundingClientRect on
        // scroll/visualViewport (Chrome URL-bar show/hide makes the header lag a frame).
        const SERVICE_BAR_PX = 36;
        const measure = () => {
            const desktop = window.matchMedia("(min-width: 768px)").matches;
            const catalogToolbarStickyTop = Math.max(
                52,
                mainRowHeight + (desktop && !isMainRowPinned ? SERVICE_BAR_PX : 0),
            );
            document.documentElement.style.setProperty(
                "--catalog-toolbar-sticky-top",
                `${catalogToolbarStickyTop}px`,
            );
            document.documentElement.style.setProperty(
                "--page-sidebar-sticky-top",
                `${catalogToolbarStickyTop}px`,
            );
        };

        measure();
        window.addEventListener("resize", measure);
        return () => {
            window.removeEventListener("resize", measure);
            document.documentElement.style.removeProperty("--catalog-toolbar-sticky-top");
            document.documentElement.style.removeProperty("--page-sidebar-sticky-top");
        };
    }, [mainRowHeight, isMainRowPinned, isPhoneDropdownOpen, searchOpen]);

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

    const toggleMobileSearch = () => {
        setProfileMenuPath(null);
        setSearchOpen((current) => !current);
    };

    const closeMobileSearch = () => {
        setSearchOpen(false);
    };

    const toggleProfileMenu = () => {
        setSearchOpen(false);
        setProfileMenuPath((current) => (current ? null : readLocation()));
    };

    const popularSearches = siteContent.search_popular_brands.map((brand) => brand.name);

    return (
        <>
            <div className={`relative ${isPhoneDropdownOpen ? "z-[160]" : "z-[140]"}`}>
                <HeaderServiceBar
                    isCompact={false}
                    promoText={promoText}
                    phoneShortLabel={phoneShortLabel}
                    phoneDropdownLinks={phoneDropdownLinks}
                    messengerLinks={messengerLinks}
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
            </div>

            {/* Sentinel sits above sticky row: when it leaves, row is pinned (shadow). */}
            <div ref={mainRowSentinelRef} aria-hidden className="h-px w-full" />

            {/* Mobile: always fixed + spacer. Service bar is md+ only, so no overlap. */}
            <div className="md:hidden" style={{ height: mainRowHeight }} aria-hidden />

            <header
                ref={mainRowRef}
                className={[
                    "z-[140] bg-admin-surface top-0",
                    "fixed inset-x-0 md:sticky md:inset-x-auto",
                    "border-b border-admin-border",
                    isMainRowPinned ? "shadow-admin-header" : "",
                ].join(" ")}
            >
                <HeaderMainRow
                    searchRef={searchRef}
                    desktopSearchInputRef={desktopSearchInputRef}
                    accountRef={accountRef}
                    burgerMenuRef={burgerMenuRef}
                    mainNavLinks={HEADER_MAIN_LINKS}
                    burgerLinks={HEADER_BURGER_LINKS}
                    searchOpen={searchOpen}
                    searchLoading={searchLoading}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    searchBrandResults={searchBrandResults}
                    suggestedQuery={suggestedQuery}
                    recentSearches={recentSearches}
                    popularSearches={popularSearches}
                    cartQty={cartQty}
                    isAuthenticated={isAuthenticated}
                    isAccountOpen={isAccountOpen}
                    userName={user?.name || "Пользователь"}
                    userPhone={user?.phone || ""}
                    isBurgerOpen={isBurgerOpen}
                    onSearchFocusAction={() => setSearchOpen(true)}
                    onSearchChangeAction={handleSearchChange}
                    onSearchSubmitAction={submitSearchPage}
                    onSearchResetAction={resetSearch}
                    onClearRecentAction={clearRecentSearches}
                    onRecentSelectAction={selectSuggestion}
                    onPopularSelectAction={selectSuggestion}
                    onBrandSelectAction={handleSelectBrand}
                    onProductSelectAction={handleSelectProduct}
                    onSuggestedQueryAction={selectSuggestion}
                    onToggleAccountAction={() => setIsAccountOpen((prev) => !prev)}
                    onCloseAccountAction={() => setIsAccountOpen(false)}
                    onLogoutAction={() => {
                        logout();
                        setIsAccountOpen(false);
                    }}
                    onToggleBurgerMenuAction={() => setIsBurgerOpen((prev) => !prev)}
                    onCloseBurgerMenuAction={() => setIsBurgerOpen(false)}
                />
                {/* Product/mobile sticky title portals here so it rubber-bands with the header. */}
                <div id={HEADER_STICKY_EXTENSION_ID} />
            </header>

            <Suspense
                fallback={
                    <HeaderNavFallback
                        isCompact={false}
                        hideBelowMd={!showMobileCategoryPills}
                        links={HEADER_CATEGORY_PILLS}
                    />
                }
            >
                <HeaderNav
                    isCompact={false}
                    hideBelowMd={!showMobileCategoryPills}
                    links={HEADER_CATEGORY_PILLS}
                    onLocationAction={syncMenuLocation}
                />
            </Suspense>

            <MobileSearchSheet
                open={searchOpen}
                searchLoading={searchLoading}
                searchQuery={searchQuery}
                searchResults={searchResults}
                searchBrandResults={searchBrandResults}
                suggestedQuery={suggestedQuery}
                recentSearches={recentSearches}
                popularSearches={popularSearches}
                onChangeAction={handleSearchChange}
                onSubmitAction={submitSearchPage}
                onCloseAction={closeMobileSearch}
                onClearRecentAction={clearRecentSearches}
                onRecentSelectAction={selectSuggestion}
                onPopularSelectAction={selectSuggestion}
                onBrandSelectAction={handleSelectBrand}
                onProductSelectAction={handleSelectProduct}
                onSuggestedQueryAction={selectSuggestion}
            />
            <MobileProfileSheet open={profileMenuOpen} onCloseAction={closeProfileMenu} />
            <MobileTabBar
                cartQty={cartQty}
                searchOpen={searchOpen}
                menuOpen={profileMenuOpen}
                onOpenSearchAction={toggleMobileSearch}
                onToggleMenuAction={toggleProfileMenu}
                onDismissMenuAction={(href) => {
                    setSearchOpen(false);
                    if (!href || href === readLocation()) {
                        closeProfileMenu();
                    }
                }}
            />
        </>
    );
}