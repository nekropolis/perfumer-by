"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import CatalogFilters from "@/components/catalog/catalog-filters";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { siteBtnPrimary, siteBtnSecondary } from "@/lib/site-ui-classes";

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
    productsCount: number;
    compact?: boolean;
};

function DrawerPanel({
    onClose,
    onReset,
    hasActiveFilters,
    productsCount,
    children,
}: {
    onClose: () => void;
    onReset: () => void;
    hasActiveFilters: boolean;
    productsCount: number;
    children: ReactNode;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
    }, []);

    return (
        <div className="fixed inset-0 isolate z-[150] lg:hidden" role="presentation">
            <button
                type="button"
                aria-label="Закрыть фильтры"
                className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-[1px]"
                onClick={onClose}
            />

            <aside
                className="absolute inset-y-0 left-0 z-10 flex h-full w-[min(92vw,24rem)] max-w-full flex-col border-r border-admin-border bg-admin-surface shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="catalog-mobile-filters-title"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-admin-border px-4 py-3">
                    <h2
                        id="catalog-mobile-filters-title"
                        className="min-w-0 flex-1 text-base font-semibold text-admin-text"
                    >
                        Фильтры
                    </h2>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-admin-surface text-admin-text transition hover:bg-admin-muted"
                        aria-label="Закрыть фильтры"
                    >
                        <X className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                    {children}
                </div>

                <div className="shrink-0 border-t border-admin-border bg-admin-surface p-3">
                    <div className="flex flex-col gap-2">
                        {hasActiveFilters ? (
                            <button type="button" onClick={onReset} className={`${siteBtnSecondary} w-full`}>
                                Очистить фильтры
                            </button>
                        ) : null}
                        <button type="button" onClick={onClose} className={`${siteBtnPrimary} w-full`}>
                            Показать {productsCount} {productsCountLabel(productsCount)}
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}

function productsCountLabel(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "товар";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "товара";
    return "товаров";
}

export default function CatalogMobileFiltersDrawer(props: Props) {
    const [open, setOpen] = useState(false);
    const compact = props.compact ?? false;
    const searchParams = useSearchParams();
    const { navigate } = useCatalogNavigation();

    const hasActiveFilters = Array.from(searchParams.keys()).some((key) => key !== "page" && key !== "sort");

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

    const resetFilters = () => {
        navigate(props.basePath);
    };

    const drawer =
        open && typeof document !== "undefined" ? (
            createPortal(
                <DrawerPanel
                    onClose={() => setOpen(false)}
                    onReset={resetFilters}
                    hasActiveFilters={hasActiveFilters}
                    productsCount={props.productsCount}
                >
                    <CatalogFilters
                        brands={props.brands}
                        basePath={props.basePath}
                        showBrandFilter={props.showBrandFilter}
                        attributes={props.attributes}
                        priceRange={props.priceRange}
                        volumeOptions={props.volumeOptions}
                        hideReset
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
                            ? `${siteBtnSecondary} h-11 w-full justify-between gap-2 px-3 [touch-action:manipulation]`
                            : `${siteBtnSecondary} w-full justify-between px-4 py-3.5 [touch-action:manipulation]`
                    }
                >
                    <span>Фильтры{hasActiveFilters ? " •" : ""}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-admin-text-secondary" aria-hidden />
                </button>
            </div>

            {drawer}
        </>
    );
}
