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
