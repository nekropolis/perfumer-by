<?php

namespace Modules\Reviews\Http\Controllers\Api;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Reviews\Http\Requests\StoreReviewRequest;
use Modules\Reviews\Models\Review;
use Modules\Reviews\Support\RecaptchaVerifier;

class ReviewController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:product,store'],
            'product_id' => ['nullable', 'integer', 'exists:products,id', 'required_if:type,product'],
        ], [
            'type.required' => 'Укажите тип отзывов.',
            'product_id.required_if' => 'Укажите товар.',
        ]);

        $query = Review::query()->published();

        if ($validated['type'] === Review::TYPE_STORE) {
            $query->where('type', Review::TYPE_STORE)->whereNull('product_id');
        } else {
            $query->where('type', Review::TYPE_PRODUCT)
                ->where('product_id', (int) $validated['product_id']);
        }

        $total = (clone $query)->count();

        $byStars = ['5' => 0, '4' => 0, '3' => 0, '2' => 0, '1' => 0];
        if ($total > 0) {
            $rows = (clone $query)
                ->selectRaw('stars, COUNT(*) as c')
                ->groupBy('stars')
                ->pluck('c', 'stars');
            foreach (array_keys($byStars) as $k) {
                $byStars[$k] = (int) ($rows[(int) $k] ?? 0);
            }
        }

        $average = $total > 0 ? round((float) (clone $query)->avg('stars'), 2) : null;

        return response()->json([
            'data' => [
                'total' => $total,
                'average' => $average,
                'by_stars' => $byStars,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:product,store'],
            'product_id' => ['nullable', 'integer', 'exists:products,id', 'required_if:type,product'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'offset' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'stars' => ['nullable', 'integer', 'min:1', 'max:5'],
        ], [
            'type.required' => 'Укажите тип отзывов.',
            'product_id.required_if' => 'Укажите товар.',
        ]);

        $limit = (int) ($validated['limit'] ?? 50);
        $limit = max(1, min(100, $limit));
        $offset = (int) ($validated['offset'] ?? 0);
        $offset = max(0, $offset);

        $query = Review::query()
            ->published()
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->offset($offset)
            ->limit($limit);

        if ($validated['type'] === Review::TYPE_PRODUCT) {
            $query->where('type', Review::TYPE_PRODUCT)
                ->where('product_id', (int) $validated['product_id']);
        } else {
            $query->where('type', Review::TYPE_STORE)->whereNull('product_id');
        }

        if (isset($validated['stars'])) {
            $query->where('stars', (int) $validated['stars']);
        }

        $items = $query->get()->map(fn (Review $r) => $this->reviewPayload($r));

        return response()->json(['data' => $items]);
    }

    public function store(StoreReviewRequest $request, RecaptchaVerifier $recaptcha): JsonResponse
    {
        if ($recaptcha->isRequired()) {
            $token = (string) $request->input('captcha_token', '');
            if ($token === '' || ! $recaptcha->verify($token, $request->ip())) {
                $this->apiError(422, 'Не удалось пройти проверку reCAPTCHA. Обновите страницу и попробуйте снова.', 'reviews.captcha.failed');
            }
        }

        $type = (string) $request->validated('type');
        $productId = $type === Review::TYPE_STORE ? null : (int) $request->validated('product_id');

        $review = Review::query()->create([
            'type' => $type,
            'product_id' => $productId,
            'name' => (string) $request->validated('name'),
            'body' => (string) $request->validated('text'),
            'stars' => (int) $request->validated('stars'),
            'status' => Review::STATUS_PENDING,
            'published_at' => null,
        ]);

        return response()->json([
            'message' => 'Спасибо! Отзыв отправлен на модерацию и скоро появится на сайте.',
            'data' => $this->reviewPayload($review),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function reviewPayload(Review $review): array
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

    protected function apiError(int $status, string $message, string $code): never
    {
        throw new HttpResponseException(response()->json([
            'message' => $message,
            'code' => $code,
        ], $status));
    }
}
