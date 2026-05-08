"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import StoreReviewsView from "@/components/reviews/store-reviews-view";
import StoreReviewsStickySummary from "@/components/reviews/store-reviews-sticky-summary";
import type { PublishedReviewStats, ReviewItem, ReviewStatsByStars } from "@/types/reviews";

const EMPTY_BY_STARS: ReviewStatsByStars = {
    "5": 0,
    "4": 0,
    "3": 0,
    "2": 0,
    "1": 0,
};

const MD_MIN = 768;

function readStickyTopPx(): number {
    if (typeof document === "undefined") {
        return 91;
    }
    const styles = getComputedStyle(document.documentElement);
    const rawSidebar = styles.getPropertyValue("--page-sidebar-sticky-top").trim();
    const sidebarValue = Number.parseFloat(rawSidebar);
    if (Number.isFinite(sidebarValue)) {
        return sidebarValue + 12;
    }
    const rawCatalog = styles.getPropertyValue("--catalog-toolbar-sticky-top").trim();
    const catalogValue = Number.parseFloat(rawCatalog);
    return (Number.isFinite(catalogValue) ? catalogValue : 79) + 12;
}

type Props = {
    initialReviews: ReviewItem[];
    /** Совпадает с `limit` первого запроса в `page.tsx`. */
    pageSize: number;
    children: ReactNode;
    stats: PublishedReviewStats | null;
};

export default function ReviewsPageClient({ initialReviews, pageSize, children, stats }: Props) {
    const [formOpen, setFormOpen] = useState(false);
    const [submitOk, setSubmitOk] = useState<string | null>(null);
    const [starsFilter, setStarsFilter] = useState<number | null>(null);
    const [pinStyle, setPinStyle] = useState<CSSProperties | null>(null);

    const asideRef = useRef<HTMLElement>(null);
    const pinRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef(0);

    const openForm = () => {
        setSubmitOk(null);
        setFormOpen(true);
    };

    const toggleStarsFilter = (stars: number) => {
        setStarsFilter((prev) => (prev === stars ? null : stars));
    };

    const snapshot: PublishedReviewStats = stats ?? {
        total: 0,
        average: null,
        by_stars: { ...EMPTY_BY_STARS },
    };

    const syncPin = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        if (window.innerWidth < MD_MIN) {
            setPinStyle(null);
            return;
        }
        const col = asideRef.current;
        const pin = pinRef.current;
        if (!col || !pin) {
            return;
        }
        const topGap = readStickyTopPx();
        const cr = col.getBoundingClientRect();
        const pinH = pin.getBoundingClientRect().height;
        const bottomLimit = topGap + pinH + 12;
        const canBeFixed = cr.top <= topGap && cr.bottom >= bottomLimit;
        const reachedColumnBottom = cr.top <= topGap && cr.bottom < bottomLimit;
        if (canBeFixed) {
            const next: CSSProperties = {
                position: "fixed",
                top: topGap,
                left: cr.left,
                width: cr.width,
                zIndex: 25,
            };
            setPinStyle((prev) => {
                if (
                    prev &&
                    prev.position === "fixed" &&
                    prev.top === next.top &&
                    prev.left === next.left &&
                    prev.width === next.width
                ) {
                    return prev;
                }
                return next;
            });
        } else if (reachedColumnBottom) {
            const next: CSSProperties = {
                position: "absolute",
                bottom: 0,
                left: 0,
                width: "100%",
                zIndex: 25,
            };
            setPinStyle((prev) => {
                if (
                    prev &&
                    prev.position === "absolute" &&
                    prev.bottom === next.bottom &&
                    prev.left === next.left &&
                    prev.width === next.width
                ) {
                    return prev;
                }
                return next;
            });
        } else {
            setPinStyle((prev) => (prev === null ? prev : null));
        }
    }, []);

    const scheduleSync = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = 0;
            syncPin();
        });
    }, [syncPin]);

    useEffect(() => {
        scheduleSync();
        window.addEventListener("scroll", scheduleSync, { passive: true });
        window.addEventListener("resize", scheduleSync);
        const ro =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => scheduleSync()) : null;
        const col = asideRef.current;
        const pin = pinRef.current;
        if (ro) {
            if (col) {
                ro.observe(col);
            }
            if (pin) {
                ro.observe(pin);
            }
        }
        return () => {
            window.removeEventListener("scroll", scheduleSync);
            window.removeEventListener("resize", scheduleSync);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            ro?.disconnect();
        };
    }, [scheduleSync, formOpen, starsFilter]);

    return (
        <>
            <div className="mb-6 space-y-2 sm:mb-8">
                {children}
                {submitOk ? <p className="text-sm text-emerald-700">{submitOk}</p> : null}
            </div>
            <div className="flex w-full max-w-full flex-col-reverse gap-6 overflow-visible md:flex-row md:items-stretch md:gap-8">
                <section className="min-w-0 w-full flex-1 basis-0 md:min-w-0">
                    <StoreReviewsView
                        initialReviews={initialReviews}
                        pageSize={pageSize}
                        hideHero
                        formOpen={formOpen}
                        onFormOpenChangeAction={setFormOpen}
                        onSubmitSuccessMessageAction={setSubmitOk}
                        starsFilter={starsFilter}
                        onClearStarsFilterAction={() => setStarsFilter(null)}
                    />
                </section>
                <aside
                    ref={asideRef}
                    className="mx-auto flex w-full max-w-sm shrink-0 flex-col md:relative md:mx-0 md:min-h-0 md:w-100 md:max-w-100 md:flex-none md:shrink-0 md:self-stretch"
                >
                    <div
                        ref={pinRef}
                        className="w-full md:relative md:z-10 md:pt-0.5"
                        style={pinStyle ?? undefined}
                    >
                        <StoreReviewsStickySummary
                            total={snapshot.total}
                            average={snapshot.average}
                            byStars={snapshot.by_stars}
                            selectedStars={starsFilter}
                            onToggleStarsFilter={toggleStarsFilter}
                            onWriteReview={openForm}
                        />
                    </div>
                    <div className="hidden min-h-0 flex-1 md:block" aria-hidden />
                </aside>
            </div>
        </>
    );
}
