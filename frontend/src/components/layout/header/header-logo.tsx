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
            className="h-auto w-[112px] object-contain sm:w-[128px] md:w-[168px]"
        />
    );

    if (isHomePage) {
        return (
            <div className="shrink-0" aria-label="Perfumer">
                {logoImage}
            </div>
        );
    }

    return (
        <Link
            href="/"
            className="shrink-0 transition hover:opacity-80"
            aria-label="Perfumer"
        >
            {logoImage}
        </Link>
    );
}
