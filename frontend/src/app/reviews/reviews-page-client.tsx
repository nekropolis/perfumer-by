"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import StoreReviewsView from "@/components/reviews/store-reviews-view";
import type { ReviewItem } from "@/types/reviews";

type Props = {
    initialReviews: ReviewItem[];
    children: ReactNode;
};

export default function ReviewsPageClient({ initialReviews, children }: Props) {
    const [formOpen, setFormOpen] = useState(false);
    const [submitOk, setSubmitOk] = useState<string | null>(null);

    return (
        <>
            <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0 flex-1 space-y-2">{children}</div>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end sm:pt-0.5">
                    <button
                        type="button"
                        onClick={() => {
                            setSubmitOk(null);
                            setFormOpen(true);
                        }}
                        className="w-full rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 sm:w-auto"
                    >
                        Написать отзыв
                    </button>
                    {submitOk ? (
                        <p className="text-sm text-emerald-700 sm:max-w-xs sm:text-right">{submitOk}</p>
                    ) : null}
                </div>
            </div>
            <StoreReviewsView
                initialReviews={initialReviews}
                hideHero
                formOpen={formOpen}
                onFormOpenChangeAction={setFormOpen}
                onSubmitSuccessMessageAction={setSubmitOk}
            />
        </>
    );
}
