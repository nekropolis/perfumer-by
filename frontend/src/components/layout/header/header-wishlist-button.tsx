"use client";

import Link from "next/link";

type HeaderWishlistButtonProps = {
    qty: number;
};

export default function HeaderWishlistButton({ qty }: HeaderWishlistButtonProps) {
    return (
        <Link
            href="/wishlist"
            className="relative hidden h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--header-control-bg)] text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--background)] hover:text-[var(--accent)] md:inline-flex md:h-11 md:w-11"
        >
            <span aria-hidden>♡</span>
            {qty > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-medium text-white">
                    {qty}
                </span>
            )}
        </Link>
    );
}
