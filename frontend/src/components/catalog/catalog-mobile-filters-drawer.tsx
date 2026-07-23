"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCatalogSearchParams } from "@/components/catalog/catalog-search-params";
import { SlidersHorizontal } from "lucide-react";
import CatalogFilters from "@/components/catalog/catalog-filters";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import {
    siteBtnPrimary,
    siteBtnSecondary,
    siteFilterChip,
    siteFilterChipInactive,
} from "@/lib/site-ui-classes";
import {
    buildCatalogFacetedFiltersResetPath,
    hasCatalogFacetedFilters,
} from "@/lib/catalog-listing-query";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

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
    sheetState,
    onClose,
    onReset,
    onShow,
    onSheetTransitionEnd,
    productsCount,
    children,
}: {
    sheetState: "open" | "closed";
    onClose: () => void;
    onReset: () => void;
    onShow: () => void;
    onSheetTransitionEnd: () => void;
    productsCount: number;
    children: ReactNode;
}) {
    const overlayTop = "var(--catalog-toolbar-sticky-top, 4rem)";
    const sheetTop = "calc(var(--catalog-toolbar-sticky-top, 4rem) + 10px)";

    return (
        <div
            className="pointer-events-none fixed inset-0 isolate z-[150] lg:hidden"
            role="presentation"
        >
            <button
                type="button"
                aria-label="Закрыть фильтры"
                className="catalog-filters-overlay pointer-events-auto absolute inset-x-0 bottom-0 z-0 bg-slate-900/40"
                style={{ top: overlayTop }}
                data-state={sheetState}
                onClick={onClose}
            />

            <div
                className="catalog-filters-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-3xl bg-admin-surface shadow-2xl"
                style={{ top: sheetTop }}
                data-state={sheetState}
                role="dialog"
                aria-modal="true"
                aria-labelledby="catalog-mobile-filters-title"
                onTransitionEnd={(event) => {
                    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
                        return;
                    }
                    onSheetTransitionEnd();
                }}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-admin-border px-5 py-4">
                    <h2
                        id="catalog-mobile-filters-title"
                        className="text-lg font-semibold text-admin-text"
                    >
                        Фильтры
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 text-sm font-medium text-admin-text-secondary transition hover:text-admin-text"
                    >
                        Закрыть
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                    {children}
                </div>

                <div
                    className="shrink-0 border-t border-admin-border bg-admin-surface px-4 pt-4"
                    style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={onReset} className={`${siteBtnSecondary} w-full`}>
                            Сбросить
                        </button>
                        <button type="button" onClick={onShow} className={`${siteBtnPrimary} w-full`}>
                            Показать {productsCount}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CatalogMobileFiltersDrawer(props: Props) {
    const [mounted, setMounted] = useState(false);
    const [sheetState, setSheetState] = useState<"open" | "closed">("closed");
    const closeAfterTransitionRef = useRef(false);
    const compact = props.compact ?? false;
    const searchParams = useCatalogSearchParams();
    const { navigate } = useCatalogNavigation();
    const priceApplyRef = useRef<(() => void) | null>(null);

    const openPanel = useCallback(() => {
        closeAfterTransitionRef.current = false;
        setMounted(true);
        setSheetState("closed");
    }, []);

    useEffect(() => {
        if (!mounted || sheetState !== "closed" || closeAfterTransitionRef.current) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setSheetState("open");
            });
        });

        return () => cancelAnimationFrame(frame);
    }, [mounted, sheetState]);

    const requestClose = useCallback(() => {
        closeAfterTransitionRef.current = true;
        setSheetState("closed");
    }, []);

    const handleSheetTransitionEnd = useCallback(() => {
        if (closeAfterTransitionRef.current && sheetState === "closed") {
            setMounted(false);
            closeAfterTransitionRef.current = false;
        }
    }, [sheetState]);

    useEffect(() => {
        if (!mounted) {
            return;
        }
        return lockBodyScroll();
    }, [mounted]);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const isInSheet = (target: EventTarget | null) => {
            const sheet = document.querySelector(".catalog-filters-sheet");
            return Boolean(sheet && target instanceof Node && sheet.contains(target));
        };

        const preventBackgroundTouchMove = (event: TouchEvent) => {
            if (isInSheet(event.target)) {
                return;
            }
            event.preventDefault();
        };

        const preventBackgroundWheel = (event: WheelEvent) => {
            if (isInSheet(event.target)) {
                return;
            }
            event.preventDefault();
        };

        document.addEventListener("touchmove", preventBackgroundTouchMove, { passive: false });
        document.addEventListener("wheel", preventBackgroundWheel, { passive: false });
        return () => {
            document.removeEventListener("touchmove", preventBackgroundTouchMove);
            document.removeEventListener("wheel", preventBackgroundWheel);
        };
    }, [mounted]);

    useEffect(() => {
        if (!mounted) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                requestClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [mounted, requestClose]);

    const resetFilters = () => {
        navigate(buildCatalogFacetedFiltersResetPath(props.basePath, searchParams));
        requestClose();
    };

    const showResults = () => {
        priceApplyRef.current?.();
        requestClose();
    };

    const drawer =
        mounted && typeof document !== "undefined" ? (
            createPortal(
                <DrawerPanel
                    sheetState={sheetState}
                    onClose={requestClose}
                    onReset={resetFilters}
                    onShow={showResults}
                    onSheetTransitionEnd={handleSheetTransitionEnd}
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
                        variant="modal"
                        priceApplyRef={priceApplyRef}
                    />
                </DrawerPanel>,
                document.body
            )
        ) : null;

    const hasActiveFilters = hasCatalogFacetedFilters(searchParams);
    const filterChipClass = `${siteFilterChip} ${siteFilterChipInactive} inline-flex items-center font-medium`;

    return (
        <>
            <div className={compact ? "shrink-0 lg:hidden" : "mb-4 lg:hidden"}>
                <button
                    type="button"
                    onClick={openPanel}
                    className={
                        compact
                            ? `${filterChipClass} h-10 shrink-0 gap-2 px-4 text-sm [touch-action:manipulation]`
                            : `${filterChipClass} w-full justify-center gap-2 px-4 py-3.5 text-sm [touch-action:manipulation]`
                    }
                >
                    <SlidersHorizontal className="h-4 w-4 shrink-0 text-admin-text-secondary" aria-hidden />
                    <span>Фильтры{hasActiveFilters ? " •" : ""}</span>
                </button>
            </div>

            {drawer}
        </>
    );
}
