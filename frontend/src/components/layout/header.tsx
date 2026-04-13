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
        <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="shrink-0 text-xl font-semibold tracking-tight text-black transition hover:opacity-80"
                    >
                        Perfumer
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden items-center gap-6 md:flex">
                        <Link
                            href="/catalog"
                            className="text-sm font-medium text-gray-700 transition hover:text-black"
                        >
                            Каталог
                        </Link>

                        <Link
                            href="/catalog?sort=new"
                            className="text-sm font-medium text-gray-700 transition hover:text-black"
                        >
                            Новинки
                        </Link>

                        <Link
                            href="/catalog?sale=1"
                            className="text-sm font-medium text-gray-700 transition hover:text-black"
                        >
                            Акции
                        </Link>
                    </nav>

                    {/* Right controls */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Account desktop */}
                        <div className="relative hidden md:block" ref={accountRef}>
                            {isAuthenticated ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                                        onClick={() => setIsAccountOpen((prev) => !prev)}
                                    >
                                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-black">
                                            {(user?.name || "A").slice(0, 1).toUpperCase()}
                                        </span>
                                        <span>{user?.name || "Аккаунт"}</span>
                                    </button>

                                    {isAccountOpen && (
                                        <div className="absolute right-0 mt-2 w-64 rounded-3xl border bg-white p-2 shadow-lg">
                                            <div className="px-3 py-3">
                                                <div className="text-sm font-medium text-black">
                                                    {user?.name || "Пользователь"}
                                                </div>
                                                <div className="mt-1 text-xs text-gray-500">
                                                    {user?.phone}
                                                </div>
                                            </div>

                                            <div className="my-1 border-t" />

                                            <Link
                                                href="/account"
                                                className="block rounded-2xl px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                                onClick={() => setIsAccountOpen(false)}
                                            >
                                                Личный кабинет
                                            </Link>

                                            <button
                                                type="button"
                                                className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-black"
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
                                    className="inline-flex items-center rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                                >
                                    Войти
                                </Link>
                            )}
                        </div>

                        {/* Cart */}
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

                        {/* Mobile menu button */}
                        <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white transition hover:bg-gray-50 md:hidden"
                            onClick={() => setIsMobileOpen((prev) => !prev)}
                            aria-label="Открыть меню"
                        >
                            <span className="text-lg leading-none">
                                {isMobileOpen ? "×" : "☰"}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            {isMobileOpen && (
                <div className="border-t bg-white md:hidden">
                    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-2">
                            <Link
                                href="/catalog"
                                className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Каталог
                            </Link>

                            <Link
                                href="/catalog?sort=new"
                                className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Новинки
                            </Link>

                            <Link
                                href="/catalog?sale=1"
                                className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Акции
                            </Link>

                            <Link
                                href="/cart"
                                className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Корзина {cartQty > 0 ? `(${cartQty})` : ""}
                            </Link>

                            {isAuthenticated ? (
                                <>
                                    <div className="mt-2 rounded-2xl bg-gray-50 px-3 py-3">
                                        <div className="text-sm font-medium text-black">
                                            {user?.name || "Пользователь"}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">
                                            {user?.phone}
                                        </div>
                                    </div>

                                    <Link
                                        href="/account"
                                        className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
                                        onClick={() => setIsMobileOpen(false)}
                                    >
                                        Личный кабинет
                                    </Link>

                                    <button
                                        type="button"
                                        className="rounded-2xl px-3 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
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
                                    className="rounded-2xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-black"
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