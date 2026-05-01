import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ReviewsPageClient from "./reviews-page-client";
import { apiFetch } from "@/lib/api";
import type { ReviewItem, ReviewsListResponse } from "@/types/reviews";

export const metadata: Metadata = {
    title: "Отзывы о магазине",
    description: "Отзывы покупателей о работе магазина и ответы команды.",
};

export default async function StoreReviewsPage() {
    let initial: ReviewItem[] = [];
    try {
        const res = await apiFetch<ReviewsListResponse>("/reviews?type=store&limit=5&offset=0");
        initial = res.data ?? [];
    } catch {
        initial = [];
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-6"
                items={[{ label: "Главная", href: "/" }, { label: "Отзывы о магазине" }]}
            />
            <ReviewsPageClient initialReviews={initial}>
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Отзывы о магазине</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                    Сервис, доставка и покупки. Новые сообщения публикуются после проверки.
                </p>
            </ReviewsPageClient>
        </main>
    );
}
