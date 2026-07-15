"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { headerBtnIcon } from "@/lib/site-ui-classes";

type HeaderCartButtonProps = {
    qty: number;
};

export default function HeaderCartButton({ qty }: HeaderCartButtonProps) {
    return (
        <Link href="/cart" className={`${headerBtnIcon} relative`}>
            <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
            {qty > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[10px] font-semibold text-white">
                    {qty}
                </span>
            ) : null}
        </Link>
    );
}
