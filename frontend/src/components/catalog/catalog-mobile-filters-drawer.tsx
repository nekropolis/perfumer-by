"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import CatalogFilters from "@/components/catalog/catalog-filters";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";

type Props = {
    brands: CatalogBrandItem[];
    basePath: string;
    showBrandFilter: boolean;
    attributes: CatalogFilterAttribute[];
    priceRange: {
        min: number | null;
        max: number | null;
    };
    volumeOptions: {
        key: string;
        label: string;
        products_count: number;
    }[];
    compact?: boolean;
};

function DrawerPanel({
    onClose,
    children,
}: {
    onClose: () => void;
    children: ReactNode;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
    }, []);

    return (
        <div
            className="fixed inset-0 isolate z-[100] lg:hidden"
            role="presentation"
        >
            <button
                type="button"
                aria-label="Закрыть фильтры"
                className="absolute inset-0 z-0 bg-black/45"
                onClick={onClose}
            />

            <aside
                className="absolute inset-y-0 left-0 z-10 flex h-full w-[min(90vw,26rem)] max-w-full flex-col bg-[var(--surface)] shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="catalog-mobile-filters-title"
            >
                <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                    <h2
                        id="catalog-mobile-filters-title"
                        className="min-w-0 flex-1 text-lg font-bold leading-tight text-[var(--foreground)]"
                    >
                        Фильтры
                    </h2>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] transition hover:bg-[var(--background)]"
                        aria-label="Закрыть фильтры"
                    >
                        <X className="h-6 w-6 shrink-0" strokeWidth={2.5} aria-hidden />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                    {children}
                </div>
            </aside>
        </div>
    );
}

export default function CatalogMobileFiltersDrawer(props: Props) {
    const [open, setOpen] = useState(false);
    const compact = props.compact ?? false;

    useEffect(() => {
        if (!open) {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const drawer =
        open && typeof document !== "undefined" ? (
            createPortal(
                <DrawerPanel onClose={() => setOpen(false)}>
                    <CatalogFilters
                        brands={props.brands}
                        basePath={props.basePath}
                        showBrandFilter={props.showBrandFilter}
                        attributes={props.attributes}
                        priceRange={props.priceRange}
                        volumeOptions={props.volumeOptions}
                    />
                </DrawerPanel>,
                document.body
            )
        ) : null;

    return (
        <>
            <div className={compact ? "lg:hidden" : "mb-4 lg:hidden"}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={
                        compact
                            ? "inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] shadow-sm transition hover:bg-[var(--background)] [touch-action:manipulation] active:bg-[var(--background)]"
                            : "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left text-sm font-semibold text-[var(--foreground)] shadow-sm transition [touch-action:manipulation] active:bg-[var(--background)]"
                    }
                >
                    <span>Фильтры</span>
                    {compact ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden /> : null}
                </button>
            </div>

            {drawer}
        </>
    );
}
