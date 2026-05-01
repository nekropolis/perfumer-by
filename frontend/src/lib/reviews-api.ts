import { ApiRequestError, throwApiError } from "@/lib/auth-api";
import type { ReviewItem, ReviewsListResponse } from "@/types/reviews";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type { ReviewItem, ReviewReply, ReviewsListResponse } from "@/types/reviews";

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

export async function fetchStoreReviews(limit = 100, offset = 0): Promise<ReviewsListResponse> {
    const params = new URLSearchParams({
        type: "store",
        limit: String(limit),
        offset: String(offset),
    });
    const res = await fetch(`${API_BASE}/reviews?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
        return throwApiError(res, "Не удалось загрузить отзывы");
    }
    return res.json();
}

export async function fetchProductReviews(productId: number, limit = 50): Promise<ReviewsListResponse> {
    const params = new URLSearchParams({
        type: "product",
        product_id: String(productId),
        limit: String(limit),
    });
    const res = await fetch(`${API_BASE}/reviews?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
        return throwApiError(res, "Не удалось загрузить отзывы");
    }
    return res.json();
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

    const res = await fetch(`${API_BASE}/reviews`, {
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

    const res = await fetch(`${API_BASE}/reviews`, {
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
