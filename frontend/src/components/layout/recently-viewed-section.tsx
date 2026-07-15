"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore, useState } from "react";
import RecentlyViewedProductCard from "@/components/product/recently-viewed-product-card";
import {
    getRecentlyViewedServerSnapshot,
    getRecentlyViewedSnapshot,
    subscribeRecentlyViewed,
} from "@/lib/recently-viewed-products";

const RECENTLY_VIEWED_GAP_PX = 8;

const RECENTLY_VIEWED_MEDIA_QUERIES = [
    "(min-width: 1280px)",
    "(min-width: 1024px)",
    "(min-width: 768px)",
] as const;

function recentlyViewedVisibleColumns(): 2 | 3 | 4 | 6 {
    if (typeof window === "undefined") {
        return 2;
    }
    if (window.matchMedia(RECENTLY_VIEWED_MEDIA_QUERIES[0]).matches) {
        return 6;
    }
    if (window.matchMedia(RECENTLY_VIEWED_MEDIA_QUERIES[1]).matches) {
        return 4;
    }
    if (window.matchMedia(RECENTLY_VIEWED_MEDIA_QUERIES[2]).matches) {
        return 3;
    }
    return 2;
}

function subscribeRecentlyViewedVisibleColumns(onStoreChange: () => void): () => void {
    const mediaLists = RECENTLY_VIEWED_MEDIA_QUERIES.map((query) => window.matchMedia(query));
    const onChange = () => onStoreChange();
    mediaLists.forEach((mql) => mql.addEventListener("change", onChange));
    return () => mediaLists.forEach((mql) => mql.removeEventListener("change", onChange));
}

function gridColumnWidth(cols: number): string {
    const gaps = RECENTLY_VIEWED_GAP_PX * (cols - 1);
    return `calc((100% - ${gaps}px) / ${cols})`;
}

const RECENTLY_VIEWED_VISIBLE_COLS_SERVER = 2 as const;

function getRecentlyViewedVisibleColumnsServerSnapshot(): 2 | 3 | 4 | 6 {
    return RECENTLY_VIEWED_VISIBLE_COLS_SERVER;
}

type Props = {
    excludeSlug?: string | null;
};

export default function RecentlyViewedSection({ excludeSlug = null }: Props) {
    const headingId = useId();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [edge, setEdge] = useState({ left: false, right: false });

    const storedItems = useSyncExternalStore(
        subscribeRecentlyViewed,
        getRecentlyViewedSnapshot,
        getRecentlyViewedServerSnapshot,
    );

    const visibleCols = useSyncExternalStore(
        subscribeRecentlyViewedVisibleColumns,
        recentlyViewedVisibleColumns,
        getRecentlyViewedVisibleColumnsServerSnapshot,
    );

    const items = useMemo(() => {
        if (!excludeSlug) {
            return storedItems;
        }
        return storedItems.filter((entry) => entry.slug !== excludeSlug);
    }, [excludeSlug, storedItems]);

    const syncScrollState = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        setEdge({
            left: scrollLeft > 2,
            right: scrollLeft < maxScroll - 2,
        });
    }, []);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        syncScrollState();
        el.addEventListener("scroll", syncScrollState, { passive: true });
        const ro = new ResizeObserver(() => syncScrollState());
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", syncScrollState);
            ro.disconnect();
        };
    }, [items, visibleCols, syncScrollState]);

    const scrollByViewport = useCallback((dir: -1 | 1) => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
    }, []);

    if (items.length === 0) {
        return null;
    }

    const showScrollControls = items.length > visibleCols;

    return (
        <section
            className="mx-auto min-w-0 max-w-7xl p-4 sm:px-6"
            aria-labelledby={headingId}
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id={headingId} className="text-lg font-semibold text-admin-text">
                    Недавно просмотренные
                </h2>
                {showScrollControls ? (
                    <div className="flex shrink-0 gap-1">
                        <button
                            type="button"
                            aria-controls={`${headingId}-track`}
                            aria-label="Прокрутить недавно просмотренные назад"
                            disabled={!edge.left}
                            onClick={() => scrollByViewport(-1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin-text shadow-sm transition hover:bg-admin-bg disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-controls={`${headingId}-track`}
                            aria-label="Прокрутить недавно просмотренные вперёд"
                            disabled={!edge.right}
                            onClick={() => scrollByViewport(1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin-text shadow-sm transition hover:bg-admin-bg disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                ) : null}
            </div>
            <nav aria-label="Недавно просмотренные товары" className="min-w-0 w-full">
                <div
                    ref={scrollerRef}
                    id={`${headingId}-track`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            scrollByViewport(-1);
                        } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            scrollByViewport(1);
                        }
                    }}
                    className="grid grid-flow-col gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:thin] snap-x snap-mandatory focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary"
                    style={{ gridAutoColumns: gridColumnWidth(visibleCols) }}
                >
                    {items.map((item) => (
                        <div key={item.id} className="min-w-0 snap-start">
                            <RecentlyViewedProductCard product={item} />
                        </div>
                    ))}
                </div>
            </nav>
        </section>
    );
}
