"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { headerBtnIcon } from "@/lib/site-ui-classes";

type HeaderWishlistButtonProps = {
    qty: number;
    className?: string;
};

export default function HeaderWishlistButton({ qty, className = "" }: HeaderWishlistButtonProps) {
    return (
        <Link href="/wishlist" className={`${headerBtnIcon} relative ${className}`.trim()}>
            <Heart className="h-5 w-5 shrink-0 md:h-4 md:w-4" aria-hidden />
            {qty > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[10px] font-semibold text-white">
                    {qty}
                </span>
            ) : null}
        </Link>
    );
}
