"use client";

import { Star } from "lucide-react";
import type { ReviewStatsByStars } from "@/types/reviews";
import { siteBtnPrimary, siteCard } from "@/lib/site-ui-classes";

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
                flex w-full items-center gap-2 rounded-2xl px-2 py-1 text-left text-xs
                transition-all outline-none ring-offset-2 ring-offset-admin-surface
                focus-visible:ring-2 focus-visible:ring-admin-primary
                ${selected
                    ? "bg-admin-primary/10 text-admin-primary ring-1 ring-admin-primary shadow-sm"
                    : "hover:bg-admin-muted hover:shadow-sm"
                }
                `}
        >
            <span className="w-[3.25rem] shrink-0 text-[11px] leading-tight text-admin-text-secondary sm:w-[4rem] sm:text-xs">
                {starLabel(rating)}
            </span>
            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-admin-border sm:h-2">
                <div
                    className="h-full rounded-full bg-[var(--review-star)] transition-[width]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-admin-text sm:w-8 sm:text-xs">
                {count}
            </span>
        </button>
    );
}

function AverageStars({ average }: { average: number }) {
    return (
        <div className="flex flex-wrap gap-0.5 text-[var(--review-star)]" aria-hidden>
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
                        <Star className="h-4 w-4 text-admin-border sm:h-5 sm:w-5" fill="currentColor" strokeWidth={0} />
                        <span className="absolute inset-0 overflow-hidden text-[var(--review-star)]" style={{ width: `${fill * 100}%` }}>
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
        <div className={`${siteCard} box-border w-full max-w-full overflow-hidden p-4 sm:p-5`}>
            <p className="text-xs text-admin-text-secondary sm:text-sm">
                {total > 0 ? (
                    <>
                        <span className="font-medium text-admin-text">{total.toLocaleString("ru-RU")}</span>{" "}
                        {reviewsPluralWord(total)} за всё время
                    </>
                ) : (
                    "Пока нет опубликованных отзывов"
                )}
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                <div className="text-2xl font-semibold tabular-nums tracking-tight text-admin-text sm:text-3xl">
                    {avgText}
                    <span className="text-base font-normal text-admin-text-secondary sm:text-lg"> / 5</span>
                </div>
                {average !== null && average > 0 ? <AverageStars average={average} /> : null}
            </div>

            {total > 0 ? (
                <div className="mt-5 space-y-1 border-t border-admin-border pt-5">
                    <p className="mb-2 text-xs text-admin-text-secondary">Нажмите на строку, чтобы отфильтровать список.</p>
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

            <p className="mt-5 border-t border-admin-border pt-4 text-xs leading-relaxed text-admin-text-secondary">
                Оценка считается только по отзывам, которые уже прошли модерацию и опубликованы на сайте.
            </p>

            <button type="button" onClick={onWriteReview} className={`${siteBtnPrimary} mt-3 w-full sm:mt-4`}>
                Оставить отзыв
            </button>
        </div>
    );
}
