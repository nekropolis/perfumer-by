<?php

namespace Modules\Reviews\Services;

use Modules\Reviews\Models\Review;
use Modules\Reviews\Support\ReviewPayload;

class PublishedProductReviewsService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function listForProduct(int $productId, int $limit = 50): array
    {
        if ($productId <= 0) {
            return [];
        }

        $limit = max(1, min(100, $limit));

        return Review::query()
            ->published()
            ->where('type', Review::TYPE_PRODUCT)
            ->where('product_id', $productId)
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(static fn (Review $review): array => ReviewPayload::fromModel($review))
            ->values()
            ->all();
    }
}
