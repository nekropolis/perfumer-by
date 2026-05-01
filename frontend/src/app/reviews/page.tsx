import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import ReviewsPageClient from "./reviews-page-client";
import { apiFetch } from "@/lib/api";
import type { ReviewItem, ReviewsListResponse } from "@/types/reviews";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Отзывы о магазине",
    description: "Отзывы покупателей о работе магазина и ответы команды.",
    canonicalPath: "/reviews",
});

export default async function StoreReviewsPage() {
    let initial: ReviewItem[] = [];
    try {
        const res = await apiFetch<ReviewsListResponse>("/reviews?type=store&limit=5&offset=0");
        initial = res.data ?? [];
    } catch {
        initial = [];
    }

    const crumbs = [{ label: "Главная", href: "/" }, { label: "Отзывы о магазине" }];

    return (
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <JsonLd data={breadcrumbListJsonLd(crumbs)} />
            <Breadcrumbs className="mb-6" items={crumbs} />
            <ReviewsPageClient initialReviews={initial}>
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Отзывы о магазине</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                    Сервис, доставка и покупки. Новые сообщения публикуются после проверки.
                </p>
            </ReviewsPageClient>
        </main>
    );
}
