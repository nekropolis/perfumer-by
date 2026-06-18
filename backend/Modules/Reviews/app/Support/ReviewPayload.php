<?php

namespace Modules\Reviews\Support;

use Modules\Reviews\Models\Review;

final class ReviewPayload
{
    /**
     * @return array<string, mixed>
     */
    public static function fromModel(Review $review): array
    {
        $reply = null;
        if ($review->reply_text !== null && $review->reply_text !== '') {
            $reply = [
                'text' => $review->reply_text,
                'replied_at' => $review->replied_at?->toIso8601String(),
            ];
        }

        return [
            'id' => (int) $review->id,
            'type' => $review->type,
            'product_id' => $review->product_id,
            'name' => $review->name,
            'text' => $review->body,
            'stars' => (int) $review->stars,
            'created_at' => $review->created_at?->toIso8601String(),
            'published_at' => $review->published_at?->toIso8601String(),
            'reply' => $reply,
        ];
    }
}
