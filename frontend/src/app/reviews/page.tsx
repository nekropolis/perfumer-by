import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import {
    breadcrumbListJsonLd,
    homeStoreJsonLd,
    HOME_STORE_REVIEWS_ON_HOME_LIMIT,
    storeReviewItemsToHomeSnippets,
} from "@/lib/json-ld";
import ReviewsPageClient from "./reviews-page-client";
import { fetchStoreReviewStats, fetchStoreReviews } from "@/lib/reviews-api";
import type { PublishedReviewStats, ReviewItem } from "@/types/reviews";
import { buildSeoMetadata } from "@/lib/seo";
import { cache } from "react";

export const metadata: Metadata = buildSeoMetadata({
    title: "Отзывы о магазине Perfumer — рейтинг и мнения покупателей",
    description:
        "Отзывы покупателей о работе магазина Perfumer: сервис, доставка и покупки. Рейтинг и ответы команды.",
    canonicalPath: "/reviews",
});

const getStoreReviewsPageData = cache(async () => {
    const [listResult, statsResult] = await Promise.allSettled([
        fetchStoreReviews(HOME_STORE_REVIEWS_ON_HOME_LIMIT, 0),
        fetchStoreReviewStats(),
    ]);

    let initial: ReviewItem[] = [];
    let stats: PublishedReviewStats | null = null;

    if (listResult.status === "fulfilled") {
        initial = listResult.value.data ?? [];
    }
    if (statsResult.status === "fulfilled") {
        stats = statsResult.value;
    }

    return { initial, stats };
});

export default async function StoreReviewsPage() {
    const { initial, stats } = await getStoreReviewsPageData();

    const crumbs = [{ label: "Главная", href: "/" }, { label: "Отзывы о магазине" }];
    const reviewSnippets = storeReviewItemsToHomeSnippets(initial);

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto w-full max-w-7xl overflow-visible px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd
                    data={[
                        breadcrumbListJsonLd(crumbs),
                        homeStoreJsonLd(reviewSnippets, {
                            name: "Perfumer — отзывы о магазине",
                            description:
                                "Отзывы покупателей о работе магазина оригинальной парфюмерии Perfumer.",
                            urlPath: "/reviews",
                            stats,
                        }),
                    ]}
                />
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
