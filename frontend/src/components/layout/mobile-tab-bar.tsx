"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, LayoutGrid, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { isStorefrontEditable } from "@/lib/storefront-keyboard";

type Props = {
    cartQty: number;
    searchOpen: boolean;
    menuOpen: boolean;
    /** Имя пользователя, если вошёл; иначе «Профиль». */
    profileLabel: string;
    onOpenSearchAction: () => void;
    onToggleMenuAction: () => void;
    onDismissMenuAction: (href?: string) => void;
};

/**
 * Only compensates rare chrome glitches when NOT typing.
 * While typing, StorefrontKeyboardController hides the tab bar via CSS.
 */
function readKeyboardInset(): string {
    if (window.matchMedia("(min-width: 768px)").matches || isStorefrontEditable(document.activeElement)) {
        return "0px";
    }

    const viewport = window.visualViewport;
    if (!viewport) {
        return "0px";
    }

    if (viewport.offsetTop > 1) {
        return "0px";
    }

    const gap = Math.round(window.innerHeight - viewport.height);
    if (gap <= -16) {
        return `${Math.max(gap, -120)}px`;
    }

    return "0px";
}

function tabClass(active: boolean): string {
    return `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] leading-none ${
        active ? "font-semibold text-admin-text" : "font-medium text-admin-text-secondary"
    }`;
}

function tabIconClass(active: boolean): string {
    return `flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-admin-primary text-white" : ""}`;
}

export default function MobileTabBar({
    cartQty,
    searchOpen,
    menuOpen,
    profileLabel,
    onOpenSearchAction,
    onToggleMenuAction,
    onDismissMenuAction,
}: Props) {
    const pathname = usePathname();

    useEffect(() => {
        const root = document.documentElement;
        const update = (event?: Event) => {
            if (event?.type === "scroll") {
                const viewport = window.visualViewport;
                const gap = viewport
                    ? Math.round(window.innerHeight - viewport.offsetTop - viewport.height)
                    : 0;
                if (gap < 0) {
                    return;
                }
            }
            root.style.setProperty("--storefront-keyboard-inset", readKeyboardInset());
        };

        update();
        window.visualViewport?.addEventListener("resize", update);
        window.visualViewport?.addEventListener("scroll", update);
        window.addEventListener("resize", update);
        document.addEventListener("focusin", update);
        document.addEventListener("focusout", update);

        return () => {
            window.visualViewport?.removeEventListener("resize", update);
            window.visualViewport?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            document.removeEventListener("focusin", update);
            document.removeEventListener("focusout", update);
            root.style.setProperty("--storefront-keyboard-inset", "0px");
        };
    }, []);

    const homeActive = !menuOpen && !searchOpen && pathname === "/";
    const catalogActive = !menuOpen && !searchOpen && (pathname === "/catalog" || pathname.startsWith("/catalog/"));
    const cartActive = !menuOpen && !searchOpen && pathname === "/cart";
    const profileActive = !menuOpen && !searchOpen && (pathname === "/account" || pathname.startsWith("/account/"));

    return (
        <nav
            aria-label="Разделы"
            className="storefront-tab-bar fixed inset-x-0 z-[150] border-t border-admin-border backdrop-blur-md md:hidden"
            style={{
                bottom: "var(--storefront-keyboard-inset, 0px)",
                paddingBottom: "env(safe-area-inset-bottom)",
            }}
        >
            <div className="grid h-14 grid-cols-6">
                <Link href="/" className={tabClass(homeActive)} aria-current={homeActive ? "page" : undefined} onClick={() => onDismissMenuAction("/")}>
                    <span className={tabIconClass(homeActive)}>
                        <Home className="h-5 w-5" aria-hidden />
                    </span>
                    Главная
                </Link>
                <Link
                    href="/catalog"
                    className={tabClass(catalogActive)}
                    aria-current={catalogActive ? "page" : undefined}
                    onClick={() => onDismissMenuAction("/catalog")}
                >
                    <span className={tabIconClass(catalogActive)}>
                        <LayoutGrid className="h-5 w-5" aria-hidden />
                    </span>
                    Каталог
                </Link>
                <button type="button" className={tabClass(searchOpen)} aria-expanded={searchOpen} onClick={onOpenSearchAction}>
                    <span className={tabIconClass(searchOpen)}>
                        <Search className="h-5 w-5" aria-hidden />
                    </span>
                    Поиск
                </button>
                <Link href="/cart" className={tabClass(cartActive)} aria-current={cartActive ? "page" : undefined} onClick={() => onDismissMenuAction("/cart")}>
                    <span className={`relative ${tabIconClass(cartActive)}`}>
                        <ShoppingBag className="h-5 w-5" aria-hidden />
                        {cartQty > 0 ? (
                            <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-admin-primary px-1 text-[9px] font-semibold text-white ring-2 ring-admin-surface">
                                {cartQty > 99 ? "99+" : cartQty}
                            </span>
                        ) : null}
                    </span>
                    Корзина
                </Link>
                <button
                    type="button"
                    className={tabClass(menuOpen)}
                    aria-expanded={menuOpen}
                    aria-label="Меню"
                    onClick={onToggleMenuAction}
                >
                    <span className={tabIconClass(menuOpen)}>
                        <Menu className="h-5 w-5" aria-hidden />
                    </span>
                    Меню
                </button>
                <Link
                    href="/account"
                    className={`${tabClass(profileActive)} px-0.5`}
                    aria-current={profileActive ? "page" : undefined}
                    aria-label={profileLabel === "Профиль" ? "Профиль" : `Профиль, ${profileLabel}`}
                    onClick={() => onDismissMenuAction("/account")}
                >
                    <span className={tabIconClass(profileActive)}>
                        <UserRound className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="max-w-full truncate px-0.5">{profileLabel}</span>
                </Link>
            </div>
        </nav>
    );
}
