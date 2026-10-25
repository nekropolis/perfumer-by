"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Menu, Search, ShoppingBag, UserRound } from "lucide-react";

type Props = {
    cartQty: number;
    searchOpen: boolean;
    menuOpen: boolean;
    onOpenSearchAction: () => void;
    onToggleMenuAction: () => void;
    onDismissMenuAction: () => void;
};

function tabClass(active: boolean): string {
    return `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none ${
        active ? "text-admin-primary" : "text-admin-text-secondary"
    }`;
}

export default function MobileTabBar({
    cartQty,
    searchOpen,
    menuOpen,
    onOpenSearchAction,
    onToggleMenuAction,
    onDismissMenuAction,
}: Props) {
    const pathname = usePathname();

    const homeActive = !menuOpen && !searchOpen && pathname === "/";
    const catalogActive = !menuOpen && !searchOpen && (pathname === "/catalog" || pathname.startsWith("/catalog/"));
    const cartActive = !menuOpen && !searchOpen && pathname === "/cart";
    const profileActive = !menuOpen && !searchOpen && (pathname === "/account" || pathname.startsWith("/account/"));

    return (
        <nav
            aria-label="Разделы"
            className="fixed inset-x-0 bottom-0 z-[150] border-t border-admin-border bg-admin-surface/95 backdrop-blur md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="grid h-14 grid-cols-6">
                <Link href="/" className={tabClass(homeActive)} aria-current={homeActive ? "page" : undefined} onClick={onDismissMenuAction}>
                    <Home className="h-5 w-5" aria-hidden />
                    Главная
                </Link>
                <Link
                    href="/catalog"
                    className={tabClass(catalogActive)}
                    aria-current={catalogActive ? "page" : undefined}
                    onClick={onDismissMenuAction}
                >
                    <LayoutGrid className="h-5 w-5" aria-hidden />
                    Каталог
                </Link>
                <button type="button" className={tabClass(searchOpen)} aria-expanded={searchOpen} onClick={onOpenSearchAction}>
                    <Search className="h-5 w-5" aria-hidden />
                    Поиск
                </button>
                <Link href="/cart" className={tabClass(cartActive)} aria-current={cartActive ? "page" : undefined} onClick={onDismissMenuAction}>
                    <span className="relative">
                        <ShoppingBag className="h-5 w-5" aria-hidden />
                        {cartQty > 0 ? (
                            <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-admin-primary px-1 text-[9px] font-semibold text-white">
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
                    <Menu className="h-5 w-5" aria-hidden />
                    Меню
                </button>
                <Link
                    href="/account"
                    className={tabClass(profileActive)}
                    aria-current={profileActive ? "page" : undefined}
                    onClick={onDismissMenuAction}
                >
                    <UserRound className="h-5 w-5" aria-hidden />
                    Профиль
                </Link>
            </div>
        </nav>
    );
}
