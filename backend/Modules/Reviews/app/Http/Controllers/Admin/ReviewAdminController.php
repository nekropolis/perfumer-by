<?php

namespace Modules\Reviews\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Reviews\Models\Review;
use Modules\Reviews\Support\LikePattern;

class ReviewAdminController extends Controller
{
    public function stats(): JsonResponse
    {
        $pending = Review::query()
            ->where('status', Review::STATUS_PENDING)
            ->count();

        return response()->json([
            'data' => [
                'pending_count' => $pending,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', 'string', Rule::in(['pending', 'published', 'rejected'])],
            'type' => ['nullable', 'string', Rule::in(['product', 'store'])],
            'days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = Review::query()
            ->with(['product:id,name,slug'])
            ->orderByDesc('id');

        if (! empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $query->where('name', 'like', LikePattern::wrapContains($search));
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (! empty($validated['days'])) {
            $query->where('created_at', '>=', now()->subDays((int) $validated['days']));
        }

        $paginator = $query->paginate(20);
        $paginator->setCollection(
            $paginator->getCollection()->map(fn (Review $review) => $this->adminReviewPayload($review))
        );

        return response()->json($paginator);
    }

    public function show(int $id): JsonResponse
    {
        $review = Review::query()->with(['product:id,name,slug'])->findOrFail($id);

        return response()->json(['data' => $this->adminReviewPayload($review)]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $review = Review::query()->findOrFail($id);

        $validated = $request->validate([
            'status' => ['required', Rule::in([
                Review::STATUS_PENDING,
                Review::STATUS_PUBLISHED,
                Review::STATUS_REJECTED,
            ])],
        ]);

        $status = (string) $validated['status'];
        $review->status = $status;

        if ($status === Review::STATUS_PUBLISHED) {
            $review->published_at = $review->published_at ?? now();
        } else {
            $review->published_at = null;
        }

        $review->save();

        $review->load(['product:id,name,slug']);

        return response()->json([
            'message' => 'Статус обновлён',
            'data' => $this->adminReviewPayload($review),
        ]);
    }

    public function updateReply(Request $request, int $id): JsonResponse
    {
        $review = Review::query()->findOrFail($id);

        $validated = $request->validate([
            'reply_text' => ['nullable', 'string', 'max:4000'],
        ]);

        $raw = $validated['reply_text'] ?? null;
        $reply = $raw === null ? '' : trim((string) $raw);
        if ($reply === '') {
            $review->reply_text = null;
            $review->replied_at = null;
        } else {
            $review->reply_text = $reply;
            $review->replied_at = now();
        }

        $review->save();
        $review->load(['product:id,name,slug']);

        return response()->json([
            'message' => 'Ответ сохранён',
            'data' => $this->adminReviewPayload($review),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function adminReviewPayload(Review $review): array
    {
        $product = $review->product;

        return [
            'id' => (int) $review->id,
            'type' => $review->type,
            'product_id' => $review->product_id,
            'product' => $product
                ? [
                    'id' => (int) $product->id,
                    'name' => $product->name,
                    'slug' => $product->slug,
                ]
                : null,
            'name' => $review->name,
            'text' => $review->body,
            'stars' => (int) $review->stars,
            'status' => $review->status,
            'published_at' => $review->published_at?->toIso8601String(),
            'reply_text' => $review->reply_text,
            'replied_at' => $review->replied_at?->toIso8601String(),
            'created_at' => $review->created_at?->toIso8601String(),
            'updated_at' => $review->updated_at?->toIso8601String(),
        ];
    }
}
