"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/cart-provider";

export default function Header() {
    const [isOpen, setIsOpen] = useState(false);
    const { cartQty } = useCart();

    return (
        <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <div className="flex h-16 items-center justify-between gap-4">
                    <Link href="/" className="shrink-0 text-xl font-semibold tracking-tight">
                        Perfumer
                    </Link>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/cart"
                            className="relative inline-flex items-center rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 transition"
                        >
                            Корзина
                            {cartQty > 0 && (
                                <span className="ml-2 inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-black px-2 text-xs text-white">
                  {cartQty}
                </span>
                            )}
                        </Link>

                        <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border md:hidden"
                            onClick={() => setIsOpen((prev) => !prev)}
                            aria-label="Открыть меню"
                        >
                            <span className="text-lg">{isOpen ? "×" : "☰"}</span>
                        </button>
                    </div>
                </div>
            </div>

            {isOpen && (
                <div className="border-t bg-white md:hidden">
                    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-2">
                            <Link
                                href="/catalog"
                                className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                onClick={() => setIsOpen(false)}
                            >
                                Каталог
                            </Link>

                            <Link
                                href="/cart"
                                className="rounded-xl px-3 py-3 text-sm hover:bg-gray-50"
                                onClick={() => setIsOpen(false)}
                            >
                                Корзина {cartQty > 0 ? `(${cartQty})` : ""}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}