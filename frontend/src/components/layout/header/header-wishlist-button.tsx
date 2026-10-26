"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { headerBtnIcon, productsCountWord } from "@/lib/site-ui-classes";

type HeaderWishlistButtonProps = {
    qty: number;
    className?: string;
};

function wishlistCount(qty: number | null | undefined): number {
    return typeof qty === "number" && Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function wishlistLinkAriaLabel(qty: number): string {
    if (qty <= 0) {
        return "Избранное";
    }
    return `Избранное, ${qty} ${productsCountWord(qty)}`;
}

export default function HeaderWishlistButton({ qty, className = "" }: HeaderWishlistButtonProps) {
    const count = wishlistCount(qty);

    return (
        <Link
            href="/wishlist"
            className={`${headerBtnIcon} relative ${className}`.trim()}
            aria-label={wishlistLinkAriaLabel(count)}
        >
            <Heart className="h-5 w-5 shrink-0 md:h-4 md:w-4" aria-hidden />
            {count > 0 ? (
                <span
                    className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[10px] font-semibold text-white"
                    aria-hidden
                >
                    {count}
                </span>
            ) : null}
        </Link>
    );
}
