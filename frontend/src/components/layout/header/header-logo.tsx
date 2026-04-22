"use client";

import Image from "next/image";
import Link from "next/link";

export default function HeaderLogo() {
    return (
        <Link
            href="/"
            className="shrink-0 transition hover:opacity-80"
            style={{ margin: "3px" }}
            aria-label="Perfumer"
        >
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
        </Link>
    );
}
