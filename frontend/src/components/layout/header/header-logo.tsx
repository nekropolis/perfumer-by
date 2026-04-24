"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HeaderLogo() {
    const pathname = usePathname();
    const isHomePage = pathname === "/";

    const logoImage = (
        <Image
            src="/logo.svg"
            alt="Perfumer"
            width={934}
            height={356}
            sizes="(max-width: 768px) 128px, 168px"
            className="h-auto w-[128px] object-contain md:w-[168px]"
            priority
            unoptimized
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
