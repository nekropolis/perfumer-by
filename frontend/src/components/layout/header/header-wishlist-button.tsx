"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { siteBtnIcon } from "@/lib/site-ui-classes";

type HeaderWishlistButtonProps = {
    qty: number;
};

export default function HeaderWishlistButton({ qty }: HeaderWishlistButtonProps) {
    return (
        <Link href="/wishlist" className={`${siteBtnIcon} relative hidden md:inline-flex`}>
            <Heart className="h-4 w-4 shrink-0" aria-hidden />
            {qty > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[10px] font-semibold text-white">
                    {qty}
                </span>
            ) : null}
        </Link>
    );
}
