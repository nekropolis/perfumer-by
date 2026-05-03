"use client";

import { Star } from "lucide-react";
import type { ReviewStatsByStars } from "@/types/reviews";

type Props = {
    total: number;
    average: number | null;
    byStars: ReviewStatsByStars;
    selectedStars: number | null;
    onToggleStarsFilter: (stars: number) => void;
    onWriteReview: () => void;
};

function starLabel(stars: number): string {
    if (stars === 1) return "1 звезда";
    if (stars >= 2 && stars <= 4) return `${stars} звезды`;
    return "5 звёзд";
}

function reviewsPluralWord(n: number): string {
    const n100 = Math.abs(n) % 100;
    const n10 = n100 % 10;
    if (n100 > 10 && n100 < 20) return "отзывов";
    if (n10 > 1 && n10 < 5) return "отзыва";
    if (n10 === 1) return "отзыв";
    return "отзывов";
}

function StarRow({
    rating,
    count,
    total,
    selected,
    onSelect,
}: {
    rating: number;
    count: number;
    total: number;
    selected: boolean;
    onSelect: () => void;
}) {
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            title={selected ? "Показать все оценки" : `Показать отзывы: ${starLabel(rating)}`}
            className={`
                flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs
                transition-all outline-none ring-offset-2 ring-offset-[var(--surface)]
                focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                ${selected
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)] shadow-sm"
                    : "hover:bg-[var(--background)] hover:shadow-sm"
                }
                `}
        >
            <span className="w-[3.25rem] shrink-0 text-[11px] leading-tight text-[var(--text-secondary)] sm:w-[4rem] sm:text-xs">
                {starLabel(rating)}
            </span>
            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--line)] sm:h-2">
                <div
                    className="h-full rounded-full bg-amber-500/90 transition-[width]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-[var(--foreground)] sm:w-8 sm:text-xs">
                {count}
            </span>
        </button>
    );
}

function AverageStars({ average }: { average: number }) {
    return (
        <div className="flex flex-wrap gap-0.5 text-amber-500" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => {
                const fill = Math.min(1, Math.max(0, average - i));
                if (fill <= 0) {
                    return <Star key={i} className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" fill="none" strokeWidth={1.5} />;
                }
                if (fill >= 1) {
                    return <Star key={i} className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" fill="currentColor" strokeWidth={0} />;
                }
                return (
                    <span key={i} className="relative inline-flex h-4 w-4 shrink-0 sm:h-5 sm:w-5">
                        <Star className="h-4 w-4 text-[var(--line)] sm:h-5 sm:w-5" fill="currentColor" strokeWidth={0} />
                        <span className="absolute inset-0 overflow-hidden text-amber-500" style={{ width: `${fill * 100}%` }}>
                            <Star className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" strokeWidth={0} />
                        </span>
                    </span>
                );
            })}
        </div>
    );
}

export default function StoreReviewsStickySummary({
    total,
    average,
    byStars,
    selectedStars,
    onToggleStarsFilter,
    onWriteReview,
}: Props) {
    const avgText =
        average !== null
            ? average.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
            : "—";

    return (
        <div className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
            <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                {total > 0 ? (
                    <>
                        <span className="font-medium text-[var(--foreground)]">{total.toLocaleString("ru-RU")}</span>{" "}
                        {reviewsPluralWord(total)} за всё время
                    </>
                ) : (
                    "Пока нет опубликованных отзывов"
                )}
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                <div className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--foreground)] sm:text-3xl">
                    {avgText}
                    <span className="text-base font-normal text-[var(--text-secondary)] sm:text-lg"> / 5</span>
                </div>
                {average !== null && average > 0 ? <AverageStars average={average} /> : null}
            </div>

            {total > 0 ? (
                <div className="mt-5 space-y-1 border-t border-[var(--line)] pt-5">
                    <p className="mb-2 text-xs text-[var(--text-secondary)]">Нажмите на строку, чтобы отфильтровать список.</p>
                    {[5, 4, 3, 2, 1].map((n) => (
                        <StarRow
                            key={n}
                            rating={n}
                            count={byStars[String(n) as keyof ReviewStatsByStars]}
                            total={total}
                            selected={selectedStars === n}
                            onSelect={() => onToggleStarsFilter(n)}
                        />
                    ))}
                </div>
            ) : null}

            <p className="mt-5 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                Оценка считается только по отзывам, которые уже прошли модерацию и опубликованы на сайте.
            </p>

            <button
                type="button"
                onClick={onWriteReview}
                className="mt-3 w-full rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white transition hover:opacity-90 sm:mt-4 sm:px-4 sm:py-3"
            >
                Оставить отзыв
            </button>
        </div>
    );
}
