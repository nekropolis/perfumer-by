export type ReviewReply = {
    text: string;
    replied_at: string | null;
};

export type ReviewItem = {
    id: number;
    type: "product" | "store";
    product_id: number | null;
    name: string;
    text: string;
    stars: number;
    created_at: string | null;
    published_at?: string | null;
    reply?: ReviewReply | null;
};

export type ReviewsListResponse = {
    data: ReviewItem[];
};

export type ReviewStatsByStars = {
    "5": number;
    "4": number;
    "3": number;
    "2": number;
    "1": number;
};

export type PublishedReviewStats = {
    total: number;
    average: number | null;
    by_stars: ReviewStatsByStars;
};

export type ReviewStatsResponse = {
    data: PublishedReviewStats;
};
