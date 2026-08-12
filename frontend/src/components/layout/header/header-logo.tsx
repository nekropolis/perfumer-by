"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HeaderLogo() {
    const pathname = usePathname();
    const isHomePage = pathname === "/";

    const logoImage = (
        <img
            src="/logo-dark.svg"
            alt="Perfumer"
            width={168}
            height={64}
            decoding="async"
            fetchPriority="high"
            className="h-10 w-auto object-contain object-left sm:h-11 md:h-[52px]"
        />
    );

    if (isHomePage) {
        return (
            <div className="flex h-11 shrink-0 items-center" aria-label="Perfumer">
                {logoImage}
            </div>
        );
    }

    return (
        <Link
            href="/"
            className="flex h-11 shrink-0 items-center transition hover:opacity-80"
            aria-label="Perfumer"
        >
            {logoImage}
        </Link>
    );
}
