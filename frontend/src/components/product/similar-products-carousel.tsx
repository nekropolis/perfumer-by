"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import ProductCardClient from "@/components/product/product-card.client";
import type { ProductListItem } from "@/types/catalog";
import { SIMILAR_GAP_PX, similarVisibleColumns } from "@/lib/product-detail-utils";

type Props = {
    products: ProductListItem[];
};

export default function SimilarProductsCarousel({ products }: Props) {
    const scrollerId = useId();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const slidesRef = useRef<HTMLDivElement[]>([]);
    const [overflow, setOverflow] = useState(false);
    const [edge, setEdge] = useState({ left: false, right: false });
    const [slideWidthPx, setSlideWidthPx] = useState<number | null>(null);

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
        const cols = similarVisibleColumns();
        const w = el.clientWidth;
        if (w <= 0) {
            return;
        }
        const gaps = SIMILAR_GAP_PX * (cols - 1);
        const slide = (w - gaps) / cols;
        setSlideWidthPx(Math.max(148, slide));
        syncScrollState();
    }, [syncScrollState]);

    useLayoutEffect(() => {
        slidesRef.current = [];
        measureSlides();
    }, [products, measureSlides]);

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
        const mql1280 = window.matchMedia("(min-width: 1280px)");
        const mql768 = window.matchMedia("(min-width: 768px)");
        mql1280.addEventListener("change", onMq);
        mql768.addEventListener("change", onMq);
        return () => {
            el.removeEventListener("scroll", syncScrollState);
            ro.disconnect();
            mql1280.removeEventListener("change", onMq);
            mql768.removeEventListener("change", onMq);
        };
    }, [products, syncScrollState, measureSlides]);

    const scrollByViewport = useCallback((dir: -1 | 1) => {
        const el = scrollerRef.current;
        const slides = slidesRef.current.filter(Boolean);
        if (!el || slides.length === 0) {
            return;
        }

        const cols = similarVisibleColumns();
        const scrollLeft = el.scrollLeft;
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);

        let activeIndex = 0;
        for (let i = 0; i < slides.length; i++) {
            if (slides[i].offsetLeft <= scrollLeft + 4) {
                activeIndex = i;
            }
        }

        if (dir > 0) {
            const nextIndex = activeIndex + cols;
            if (nextIndex >= slides.length) {
                el.scrollTo({ left: maxScroll, behavior: "smooth" });
                return;
            }
            const targetLeft = Math.min(slides[nextIndex].offsetLeft, maxScroll);
            el.scrollTo({ left: targetLeft, behavior: "smooth" });
            return;
        }

        const prevIndex = Math.max(0, activeIndex - cols);
        el.scrollTo({ left: slides[prevIndex].offsetLeft, behavior: "smooth" });
    }, []);

    return (
        <section className="min-w-0 pt-10" aria-labelledby={scrollerId}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id={scrollerId} className="text-lg font-semibold text-admin-text">
                    Похожие товары
                </h2>
                {overflow ? (
                    <div className="flex shrink-0 gap-1">
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить похожие товары назад"
                            disabled={!edge.left}
                            onClick={() => scrollByViewport(-1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin-text shadow-sm transition hover:bg-admin-bg disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-controls={`${scrollerId}-track`}
                            aria-label="Прокрутить похожие товары вперёд"
                            disabled={!edge.right}
                            onClick={() => scrollByViewport(1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin-text shadow-sm transition hover:bg-admin-bg disabled:pointer-events-none disabled:opacity-35"
                        >
                            <ChevronRight className="h-5 w-5" aria-hidden />
                        </button>
                    </div>
                ) : null}
            </div>
            <nav aria-label="Похожие товары" className="min-w-0 w-full overflow-visible">
                {/* py: запас под hover:scale карточки; overflow-y-hidden нужен вместе с overflow-x-auto */}
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
                    className={`min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth px-0.5 py-3 [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary ${slideWidthPx === null ? "invisible" : ""}`}
                >
                    <div className="flex w-max items-stretch gap-3">
                        {products.map((item, index) => (
                            <div
                                key={item.id}
                                ref={(node) => {
                                    if (node) {
                                        slidesRef.current[index] = node;
                                    }
                                }}
                                data-similar-slide
                                className="relative shrink-0 self-stretch hover:z-20"
                                style={
                                    slideWidthPx !== null
                                        ? {
                                              width: slideWidthPx,
                                              flexBasis: slideWidthPx,
                                              flexGrow: 0,
                                              flexShrink: 0,
                                          }
                                        : undefined
                                }
                            >
                                <ProductCardClient product={item} />
                            </div>
                        ))}
                    </div>
                </div>
            </nav>
        </section>
    );
}
