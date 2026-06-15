import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import ReviewsPageClient from "./reviews-page-client";
import { apiFetch } from "@/lib/api";
import { fetchStoreReviewStats } from "@/lib/reviews-api";
import type { PublishedReviewStats, ReviewItem, ReviewsListResponse } from "@/types/reviews";
import { HOME_STORE_REVIEWS_ON_HOME_LIMIT } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Отзывы о магазине",
    description: "Отзывы покупателей о работе магазина и ответы команды.",
    canonicalPath: "/reviews",
});

export default async function StoreReviewsPage() {
    let initial: ReviewItem[] = [];
    let stats: PublishedReviewStats | null = null;

    const [listResult, statsResult] = await Promise.allSettled([
        apiFetch<ReviewsListResponse>(
            `/reviews?type=store&limit=${HOME_STORE_REVIEWS_ON_HOME_LIMIT}&offset=0`,
        ),
        fetchStoreReviewStats(),
    ]);

    if (listResult.status === "fulfilled") {
        initial = listResult.value.data ?? [];
    }
    if (statsResult.status === "fulfilled") {
        stats = statsResult.value;
    }

    const crumbs = [{ label: "Главная", href: "/" }, { label: "Отзывы о магазине" }];

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto w-full max-w-7xl overflow-visible px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd data={breadcrumbListJsonLd(crumbs)} />
                <Breadcrumbs className="mb-6" items={crumbs} />
                <ReviewsPageClient
                    initialReviews={initial}
                    pageSize={HOME_STORE_REVIEWS_ON_HOME_LIMIT}
                    stats={stats}
                >
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Отзывы о магазине</h1>
                    <p className="text-sm text-admin-text-secondary">
                        Сервис, доставка и покупки. Новые сообщения публикуются после проверки.
                    </p>
                </ReviewsPageClient>
            </div>
        </main>
    );
}
