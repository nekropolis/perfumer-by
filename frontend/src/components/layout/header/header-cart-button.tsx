"use client";

import Link from "next/link";

type HeaderCartButtonProps = {
    qty: number;
};

export default function HeaderCartButton({ qty }: HeaderCartButtonProps) {
    return (
        <Link
            href="/cart"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent)] text-sm font-semibold text-[var(--background)] transition hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2"
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

            <span className="hidden md:inline">Корзина</span>

            {qty > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--background)] px-1.5 text-[10px] font-semibold text-[var(--accent)] md:static">
                    {qty}
                </span>
            )}
        </Link>
    );
}
