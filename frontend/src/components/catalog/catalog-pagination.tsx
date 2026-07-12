"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";

type Props = {
    currentPage: number;
    lastPage: number;
    basePath: string;
    queryString?: string;
};

export default function CatalogPagination({
    currentPage,
    lastPage,
    basePath,
    queryString = "",
}: Props) {
    const { navigate, isNavigating } = useCatalogNavigation();

    if (lastPage <= 1) {
        return null;
    }

    const buildPageHref = (page: number) => {
        const params = new URLSearchParams(queryString);
        params.set("page", String(page));
        return `${basePath}?${params.toString()}`;
    };

    const handlePageClick = (event: MouseEvent<HTMLAnchorElement>, page: number) => {
        if (
            page === currentPage
            || isNavigating
            || event.metaKey
            || event.ctrlKey
            || event.shiftKey
            || event.altKey
            || event.button !== 0
        ) {
            return;
        }

        event.preventDefault();
        navigate(buildPageHref(page), { scroll: "top" });
    };

    const pageLinkClass = (page: number) =>
        `rounded-lg border px-3 py-2 text-sm transition ${
            page === currentPage
                ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--background)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
        } ${isNavigating ? "pointer-events-none opacity-60" : ""}`;

    const navLinkClass = (disabled: boolean) =>
        `rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)] ${
            disabled || isNavigating ? "pointer-events-none opacity-50" : ""
        }`;

    return (
        <div
            className="mt-8 flex items-center justify-center gap-2"
            aria-busy={isNavigating}
            aria-live="polite"
        >
            <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
                onClick={(event) => handlePageClick(event, Math.max(1, currentPage - 1))}
                className={navLinkClass(currentPage <= 1)}
                aria-disabled={currentPage <= 1 || isNavigating}
            >
                Назад
            </Link>

            {Array.from({ length: lastPage }, (_, index) => index + 1)
                .slice(Math.max(0, currentPage - 3), Math.min(lastPage, currentPage + 2))
                .map((page) => (
                    <Link
                        key={page}
                        href={buildPageHref(page)}
                        onClick={(event) => handlePageClick(event, page)}
                        className={pageLinkClass(page)}
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-disabled={isNavigating && page !== currentPage}
                    >
                        {page}
                    </Link>
                ))}

            <Link
                href={buildPageHref(Math.min(lastPage, currentPage + 1))}
                onClick={(event) => handlePageClick(event, Math.min(lastPage, currentPage + 1))}
                className={navLinkClass(currentPage >= lastPage)}
                aria-disabled={currentPage >= lastPage || isNavigating}
            >
                Вперёд
            </Link>
        </div>
    );
}
