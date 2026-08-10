"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";

type Props = {
    href: string;
    label: string;
};

/** Иконка «?» — открывает юр. страницу в новой вкладке. */
export default function LegalHelpIcon({ href, label }: Props) {
    return (
        <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className="ml-1 inline-flex align-middle text-admin-text-secondary transition hover:text-admin-primary"
            onClick={(e) => e.stopPropagation()}
        >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </Link>
    );
}
