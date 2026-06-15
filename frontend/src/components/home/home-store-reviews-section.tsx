"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { HomePageReviewSnippet } from "@/lib/json-ld";
import { siteBtnIcon, siteCard, siteNavLink } from "@/lib/site-ui-classes";

const SIMILAR_GAP_PX = 12;

function homeReviewsCarouselColumns(): 2 | 3 | 4 {
    if (typeof window === "undefined") {
        return 2;
    }
    if (window.matchMedia("(min-width: 1024px)").matches) {
        return 4;
    }
    if (window.matchMedia("(min-width: 768px)").matches) {
        return 3;
    }
    return 2;
}

function StoreReviewCard({ review }: { review: HomePageReviewSnippet }) {
    const textRef = useRef<HTMLParagraphElement>(null);
    const [textClamped, setTextClamped] = useState(false);
    const readMoreHref = `/reviews#store-review-${review.id}`;

    useLayoutEffect(() => {
        const el = textRef.current;
        if (!el) {
            return;
        }
        const measure = () => {
            setTextClamped(el.scrollHeight > el.clientHeight + 1);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [review.text]);

    return (
        <div className={`${siteCard} flex h-full min-h-[168px] max-h-[220px] flex-col p-4`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold leading-tight text-admin-text">{review.name}</div>
                {review.date ? <div className="shrink-0 text-xs text-admin-text-muted">{review.date}</div> : null}
            </div>
            <p className="sr-only">Оценка {review.rating} из 5</p>
            <div className="mt-1.5 flex gap-0.5 text-amber-500" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                    <Star
                        key={i}
                        className="h-4 w-4 shrink-0"
                        fill={i < review.rating ? "currentColor" : "none"}
                        strokeWidth={i < review.rating ? 0 : 1.5}
                    />
                ))}
            </div>
            <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
                <p
                    ref={textRef}
                    className="line-clamp-3 min-h-0 text-sm leading-relaxed text-admin-text-secondary"
                >
                    {review.text}
                </p>
                {textClamped ? (
                    <Link href={readMoreHref} className={`${siteNavLink} mt-2 shrink-0 text-sm font-medium hover:underline`}>
                        Читать весь отзыв
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

function StoreReviewsCarousel({ reviews }: { reviews: HomePageReviewSnippet[] }) {
    const headingId = useId();
    const scrollerId = useId();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState(false);
    const [edge, setEdge] = useState({ left: false, right: false });
    const [slideWidthPx, setSlideWidthPx] = useState(200);

    const syncScrollState = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        setOverflow(maxScroll > 2);
        setEdge({
            left: scrollLeft > 2,
            right: scrollLeft < maxScroll - 2,
        });
    }, []);

    const measureSlides = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        const cols = homeReviewsCarouselColumns();
        const w = el.clientWidth;
        const slide = Math.floor((w - SIMILAR_GAP_PX * (cols - 1)) / cols);
        setSlideWidthPx(Math.max(132, slide));
        syncScrollState();
    }, [syncScrollState]);

    useLayoutEffect(() => {
        measureSlides();
    }, [reviews, measureSlides]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) {
            return;
        }
        syncScrollState();
        el.addEventListener("scroll", syncScrollState, { passive: true });
        const ro = new ResizeObserver(() => measureSlides());
        ro.observe(el);
        const onMq = () => measureSlides();
        const mql1024 = window.matchMedia("(min-width: 1024px)");
        const mql768 = window.matchMedia("(min-width: 768px)");
        mql1024.addEventListener("change", onMq);
        mql768.addEventListener("change", onMq);
        return () => {
            el.removeEventListener("scroll", syncScrollState);
            ro.disconnect();
            mql1024.removeEventListener("change", onMq);
            mql768.removeEventListener("change", onMq);
        };
    }, [reviews, syncScrollState, measureSlides]);

    const scrollByViewport = useCallback(
        (dir: -1 | 1) => {
            const el = scrollerRef.current;
            if (!el) {
                return;
            }
            const cols = homeReviewsCarouselColumns();
            const step = cols * slideWidthPx + (cols - 1) * SIMILAR_GAP_PX;
            el.scrollBy({ left: dir * step, behavior: "smooth" });
        },
        [slideWidthPx],
    );

    return (
        <div className="mt-5 min-w-0 border-t border-admin-border pt-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 id={headingId} className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Отзывы клиентов
                    </h2>
                    <Link href="/reviews" className={`${siteNavLink} mt-1 inline-block text-sm font-medium hover:underline`}>
                        Все отзывы
                    </Link>
                </div>
                {overflow ? (
                    <div className="flex shrink-0 gap-1">
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить отзывы назад"
                            disabled={!edge.left}
                            onClick={() => scrollByViewport(-1)}
                            className={`${siteBtnIcon} h-9 w-9 disabled:pointer-events-none disabled:opacity-35`}
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить отзывы вперёд"
                            disabled={!edge.right}
                            onClick={() => scrollByViewport(1)}
                            className={`${siteBtnIcon} h-9 w-9 disabled:pointer-events-none disabled:opacity-35`}
                        >
                            <ChevronRight className="h-5 w-5" aria-hidden />
                        </button>
                    </div>
                ) : null}
            </div>
            <nav aria-labelledby={headingId} className="min-w-0 w-full">
                <div
                    ref={scrollerRef}
                    id={`${scrollerId}-track`}
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
                    className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth pb-1 [contain:layout_paint] [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary"
                >
                    <div className="mt-2 flex w-max snap-x snap-mandatory gap-3">
                        {reviews.map((review) => (
                            <div
                                key={review.id}
                                className="min-w-0 shrink-0 snap-start"
                                style={{ width: slideWidthPx, flex: "0 0 auto" }}
                            >
                                <StoreReviewCard review={review} />
                            </div>
                        ))}
                    </div>
                </div>
            </nav>
        </div>
    );
}

type Props = {
    storeReviews: HomePageReviewSnippet[];
};

export default function HomeStoreReviewsSection({ storeReviews }: Props) {
    return (
        <section className="mt-10">
            {storeReviews.length === 0 ? (
                <>
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Отзывы клиентов
                    </h2>
                    <p className="mt-5 text-sm leading-7 text-admin-text-secondary">
                        Пока нет опубликованных отзывов о магазине.{" "}
                        <Link href="/reviews" className="font-medium text-admin-primary hover:underline">
                            Оставить отзыв
                        </Link>
                    </p>
                </>
            ) : (
                <StoreReviewsCarousel reviews={storeReviews} />
            )}
        </section>
    );
}
