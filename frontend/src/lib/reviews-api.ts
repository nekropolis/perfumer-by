import { apiFetch, getApiBase } from "@/lib/api";
import { ApiRequestError, throwApiError } from "@/lib/auth-api";
import type { PublishedReviewStats, ReviewItem, ReviewsListResponse, ReviewStatsResponse } from "@/types/reviews";

export type {
    PublishedReviewStats,
    ReviewItem,
    ReviewReply,
    ReviewsListResponse,
    ReviewStatsByStars,
    ReviewStatsResponse,
} from "@/types/reviews";

export type SubmitProductReviewInput = {
    productId: number;
    name: string;
    text: string;
    stars: number;
    captchaToken?: string;
};

export type SubmitStoreReviewInput = {
    name: string;
    text: string;
    stars: number;
    captchaToken?: string;
};

export async function fetchStoreReviewStats(): Promise<PublishedReviewStats | null> {
    try {
        const isServer = typeof window === "undefined";
        const res = await apiFetch<ReviewStatsResponse>(
            "/reviews/stats?type=store",
            isServer ? { next: { revalidate: 300, tags: ["reviews", "reviews-store-stats"] } } : {},
        );
        return res.data ?? null;
    } catch {
        return null;
    }
}

export type FetchStoreReviewsOptions = {
    stars?: number;
};

export async function fetchStoreReviews(
    limit = 100,
    offset = 0,
    options?: FetchStoreReviewsOptions,
): Promise<ReviewsListResponse> {
    const params = new URLSearchParams({
        type: "store",
        limit: String(limit),
        offset: String(offset),
    });
    if (options?.stars !== undefined && options.stars >= 1 && options.stars <= 5) {
        params.set("stars", String(options.stars));
    }
    const isServer = typeof window === "undefined";
    return apiFetch<ReviewsListResponse>(
        `/reviews?${params.toString()}`,
        isServer ? { next: { revalidate: 300, tags: ["reviews", "reviews-store-list"] } } : {},
    );
}

export async function fetchProductReviews(productId: number, limit = 50): Promise<ReviewsListResponse> {
    const params = new URLSearchParams({
        type: "product",
        product_id: String(productId),
        limit: String(limit),
    });
    return apiFetch<ReviewsListResponse>(`/reviews?${params.toString()}`);
}

export async function submitProductReview(input: SubmitProductReviewInput): Promise<{ message: string; data: ReviewItem }> {
    const body: Record<string, unknown> = {
        type: "product",
        product_id: input.productId,
        name: input.name.trim(),
        text: input.text.trim(),
        stars: input.stars,
    };
    if (input.captchaToken) {
        body.captcha_token = input.captchaToken;
    }

    const res = await fetch(`${getApiBase()}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, "Не удалось отправить отзыв");
    }
    return res.json();
}

export async function submitStoreReview(input: SubmitStoreReviewInput): Promise<{ message: string; data: ReviewItem }> {
    const body: Record<string, unknown> = {
        type: "store",
        name: input.name.trim(),
        text: input.text.trim(),
        stars: input.stars,
    };
    if (input.captchaToken) {
        body.captcha_token = input.captchaToken;
    }

    const res = await fetch(`${getApiBase()}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, "Не удалось отправить отзыв");
    }
    return res.json();
}

export { ApiRequestError };
