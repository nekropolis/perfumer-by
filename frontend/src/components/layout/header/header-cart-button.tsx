"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { siteBtnIconPrimary } from "@/lib/site-ui-classes";

type HeaderCartButtonProps = {
    qty: number;
};

export default function HeaderCartButton({ qty }: HeaderCartButtonProps) {
    return (
        <Link href="/cart" className={`${siteBtnIconPrimary} relative text-sm font-semibold`}>
            <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden md:inline">Корзина</span>
            {qty > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-admin-primary md:static md:ml-0.5 md:h-auto md:min-w-0 md:rounded-md md:bg-white/20 md:px-1.5 md:py-0.5 md:text-[11px] md:text-white">
                    {qty}
                </span>
            ) : null}
        </Link>
    );
}
