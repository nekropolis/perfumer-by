"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import HeaderMainRow from "@/components/layout/header/header-main-row";
import HeaderNav from "@/components/layout/header/header-nav";
import HeaderServiceBar from "@/components/layout/header/header-service-bar";
import { useHeaderSearch } from "@/components/layout/header/use-header-search";
import {
    HEADER_CATALOG_DRAWER_SECTIONS,
    HEADER_CATALOG_TRIGGER,
    HEADER_POPULAR_SEARCHES,
    HEADER_SECONDARY_LINKS,
} from "@/components/layout/header/config";
import { useSiteContent } from "@/components/layout/site-content-context";
import {
    buildContactLinks,
    buildHeaderPhoneDropdown,
    buildMessengerLinks,
    buildPhoneLinks,
    phoneNationalShortSuffix,
} from "@/lib/site-contact";

const HeaderMobileMenu = dynamic(() => import("@/components/layout/header/mobile-menu"), {
    ssr: false,
    loading: () => null,
});

const HeaderCatalogDrawer = dynamic(() => import("@/components/layout/header/catalog-drawer"), {
    ssr: false,
    loading: () => null,
});

function formatMinskFreeDeliveryPromo(threshold: number): string {
    const n = Number.isFinite(threshold) ? threshold : 50;
    return `Бесплатная доставка по Минску от ${n} BYN`;
}

export default function Header() {
    const siteContent = useSiteContent();
    const promoText = formatMinskFreeDeliveryPromo(siteContent.delivery_minsk_free_threshold);
    const phoneShortLabel = phoneNationalShortSuffix(siteContent.contact_phone_mts) || "640-88-33";
    const phoneDropdownLinks = buildHeaderPhoneDropdown(siteContent);
    const messengerLinks = buildMessengerLinks(siteContent);
    const phoneLinks = buildPhoneLinks(siteContent);
    const contactLinks = buildContactLinks(siteContent);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
    const [isMainRowPinned, setIsMainRowPinned] = useState(false);
    const [mainRowHeight, setMainRowHeight] = useState(78);
    const [viewportTopOffset, setViewportTopOffset] = useState(0);
    const [menuTopOffset, setMenuTopOffset] = useState(64);
    const [menuAnchorBottom, setMenuAnchorBottom] = useState(0);

    const headerRef = useRef<HTMLElement | null>(null);
    const mainRowRef = useRef<HTMLDivElement | null>(null);
    const mainRowSentinelRef = useRef<HTMLDivElement | null>(null);
    const mobileMenuRootRef = useRef<HTMLDivElement | null>(null);
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
        onAfterNavigateAction: () => setIsMobileOpen(false),
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

            const isDesktop = window.innerWidth >= 768;
            if (
                isDesktop &&
                searchRef.current &&
                !searchRef.current.contains(event.target as Node) &&
                !mobileMenuRootRef.current?.contains(event.target as Node)
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
        const el = mainRowRef.current;
        if (!el) {
            return;
        }

        const measure = () => {
            setMainRowHeight(el.offsetHeight || 78);
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
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

        const updateViewportOffset = () => {
            const vv = window.visualViewport;
            if (!vv) {
                setViewportTopOffset(0);
                return;
            }
            setViewportTopOffset(Math.max(0, vv.offsetTop));
        };

        updateViewportOffset();
        window.visualViewport?.addEventListener("resize", updateViewportOffset);
        window.visualViewport?.addEventListener("scroll", updateViewportOffset);
        window.addEventListener("resize", updateViewportOffset);

        return () => {
            window.visualViewport?.removeEventListener("resize", updateViewportOffset);
            window.visualViewport?.removeEventListener("scroll", updateViewportOffset);
            window.removeEventListener("resize", updateViewportOffset);
        };
    }, []);

    useEffect(() => {
        const measure = () => {
            const staticHeaderHeight = headerRef.current?.offsetHeight ?? 0;
            const topOffsetCompensation = isMainRowPinned ? viewportTopOffset : 0;
            const next = Math.max(64, staticHeaderHeight + topOffsetCompensation);
            const sidebarStickyTop = Math.max(64, mainRowHeight + topOffsetCompensation);
            setMenuTopOffset(next);
            document.documentElement.style.setProperty(
                "--catalog-toolbar-sticky-top",
                `${next}px`,
            );
            document.documentElement.style.setProperty(
                "--page-sidebar-sticky-top",
                `${sidebarStickyTop}px`,
            );
        };

        measure();
        window.addEventListener("resize", measure);
        const el = headerRef.current;
        const ro = el ? new ResizeObserver(() => measure()) : null;
        if (el && ro) {
            ro.observe(el);
        }
        return () => {
            window.removeEventListener("resize", measure);
            ro?.disconnect();
            document.documentElement.style.removeProperty("--catalog-toolbar-sticky-top");
            document.documentElement.style.removeProperty("--page-sidebar-sticky-top");
        };
    }, [isMainRowPinned, mainRowHeight, viewportTopOffset, isPhoneDropdownOpen, isMobileOpen]);

    useEffect(() => {
        if (!isMobileOpen) {
            return;
        }

        const measureAnchor = () => {
            const bottom = mainRowRef.current?.getBoundingClientRect().bottom ?? menuTopOffset;
            setMenuAnchorBottom(bottom);
        };

        measureAnchor();
        window.addEventListener("resize", measureAnchor);
        const row = mainRowRef.current;
        const ro = row ? new ResizeObserver(measureAnchor) : null;
        if (row && ro) {
            ro.observe(row);
        }

        return () => {
            window.removeEventListener("resize", measureAnchor);
            ro?.disconnect();
        };
    }, [isMobileOpen, menuTopOffset, mainRowHeight, searchOpen, viewportTopOffset, isMainRowPinned]);

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
        htmlStyle.overflowX = "hidden";
        bodyStyle.overflowX = "hidden";

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

    const openMobileSearch = () => {
        setIsCatalogDrawerOpen(false);
        setIsMobileOpen(false);
        if (searchOpen) {
            resetSearch();
            return;
        }
        setSearchOpen(true);
    };

    return (
        <header
            ref={headerRef}
            className={`relative z-[140] bg-admin-surface ${isMobileOpen ? "shadow-none" : "border-b border-admin-border shadow-admin-header"}`}
        >
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

            <div ref={mainRowSentinelRef} aria-hidden className="h-px w-full" />
            {isMainRowPinned ? (
                <div aria-hidden className="w-full" style={{ height: `${mainRowHeight}px` }} />
            ) : null}
            <div
                ref={mainRowRef}
                className={`${isMainRowPinned ? "fixed inset-x-0 z-[120] shadow-admin-header" : "relative z-30"} ${isMobileOpen ? "" : "border-b border-admin-border"} bg-admin-surface`}
                style={isMainRowPinned ? { top: `${viewportTopOffset}px` } : undefined}
            >
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
                    suggestedQuery={suggestedQuery}
                    recentSearches={recentSearches}
                    popularSearches={HEADER_POPULAR_SEARCHES}
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
                    onSuggestedQueryAction={selectSuggestion}
                    onToggleAccountAction={() => setIsAccountOpen((prev) => !prev)}
                    onCloseAccountAction={() => setIsAccountOpen(false)}
                    onLogoutAction={() => {
                        logout();
                        setIsAccountOpen(false);
                    }}
                    onOpenMobileSearchAction={openMobileSearch}
                    onToggleMobileMenuAction={toggleMobileMenu}
                />
            </div>

            <HeaderNav isCompact={false} links={HEADER_SECONDARY_LINKS} />

            <HeaderMobileMenu
                isOpen={isMobileOpen}
                menuRootRef={mobileMenuRootRef}
                anchorBottom={menuAnchorBottom}
                wishlistQty={wishlistQty}
                catalogSections={HEADER_CATALOG_DRAWER_SECTIONS}
                phoneLinks={phoneLinks}
                contactLinks={contactLinks}
                isAuthenticated={isAuthenticated}
                userName={user?.name || "Пользователь"}
                userPhone={user?.phone || ""}
                onCloseAction={() => {
                    resetSearch();
                    setIsMobileOpen(false);
                }}
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