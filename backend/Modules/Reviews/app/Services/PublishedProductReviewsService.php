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

    /**
     * Агрегаты по всем опубликованным отзывам товара (не ограничены лимитом списка).
     *
     * @return array{total: int, average: float|null}
     */
    public function statsForProduct(int $productId): array
    {
        if ($productId <= 0) {
            return ['total' => 0, 'average' => null];
        }

        $row = Review::query()
            ->published()
            ->where('type', Review::TYPE_PRODUCT)
            ->where('product_id', $productId)
            ->selectRaw('COUNT(*) as total, AVG(stars) as average')
            ->first();

        $total = (int) ($row?->getAttribute('total') ?? 0);

        return [
            'total' => $total,
            'average' => $total > 0 ? round((float) $row->getAttribute('average'), 2) : null,
        ];
    }
}
