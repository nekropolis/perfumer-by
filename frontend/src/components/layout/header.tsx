"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";

export default function Header() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);

    const { cartQty } = useCart();
    const { user, isAuthenticated, logout } = useAuth();

    const accountRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!accountRef.current) return;
            if (!accountRef.current.contains(event.target as Node)) {
                setIsAccountOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <div className="flex h-16 items-center justify-between gap-4">
                    <Link href="/" className="shrink-0 text-xl font-semibold tracking-tight">
                        Perfumer
                    </Link>

                    <nav className="hidden md:flex items-center gap-6 text-sm">
                        <Link href="/catalog" className="hover:opacity-70 transition">
                            Каталог
                        </Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <div className="hidden md:block" ref={accountRef}>
                            {isAuthenticated ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        className="inline-flex items-center rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 transition"
                                        onClick={() => setIsAccountOpen((prev) => !prev)}
                                    >
                                        {user?.name || "Аккаунт"}
                                    </button>

                                    {isAccountOpen && (
                                        <div className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white p-2 shadow-lg">
                                            <div className="px-3 py-2">
                                                <div className="text-sm font-medium">{user?.name || "Пользователь"}</div>
                                                <div className="text-xs text-gray-500">{user?.phone}</div>
                                            </div>

                                            <div className="my-1 border-t" />

                                            <Link
                                                href="/account"
                                                className="block rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
                                                onClick={() => setIsAccountOpen(false)}
                                            >
                                                Личный кабинет
                                            </Link>

                                            <button
                                                type="button"
                                                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50"
                                                onClick={() => {
                                                    logout();
                                                    setIsAccountOpen(false);
                                                }}
                                            >
                                                Выйти
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <Link
                                    href="/login"
                                    className="inline-flex items-center rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 transition"
                                >
                                    Войти
                                </Link>
                            )}
                        </div>

                        <Link
                            href="/cart"
                            className="relative inline-flex items-center rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 transition"
                        >
                            Корзина
                            {cartQty > 0 && (
                                <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-black px-2 text-xs text-white">
                  {cartQty}
                </span>
                            )}
                        </Link>

                        <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border md:hidden"
                            onClick={() => setIsMobileOpen((prev) => !prev)}
                            aria-label="Открыть меню"
                        >
                            <span className="text-lg">{isMobileOpen ? "×" : "☰"}</span>
                        </button>
                    </div>
                </div>
            </div>

            {isMobileOpen && (
                <div className="border-t bg-white md:hidden">
                    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-2">
                            <Link
                                href="/catalog"
                                className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Каталог
                            </Link>

                            <Link
                                href="/cart"
                                className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Корзина {cartQty > 0 ? `(${cartQty})` : ""}
                            </Link>

                            {isAuthenticated ? (
                                <>
                                    <Link
                                        href="/account"
                                        className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                        onClick={() => setIsMobileOpen(false)}
                                    >
                                        Личный кабинет
                                    </Link>

                                    <button
                                        type="button"
                                        className="rounded-xl px-3 py-3 text-left text-sm hover:bg-gray-50"
                                        onClick={() => {
                                            logout();
                                            setIsMobileOpen(false);
                                        }}
                                    >
                                        Выйти
                                    </button>
                                </>
                            ) : (
                                <Link
                                    href="/login"
                                    className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                    onClick={() => setIsMobileOpen(false)}
                                >
                                    Войти
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}