<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Checkout\Http\Resources\StockNotificationRequestResource;
use Modules\Checkout\Models\StockNotificationRequest;

class CallbackRequestController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
            'phone' => ['required', 'string', 'max:32', 'regex:' . Phone::REGEX],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        $phone = Phone::normalize($validated['phone']);
        $comment = $this->sanitizeComment($validated['comment'] ?? null);

        $product = !empty($validated['product_id'])
            ? Product::query()->find($validated['product_id'])
            : null;

        $variant = !empty($validated['variant_id'])
            ? ProductVariantLink::query()->with('definition')->find($validated['variant_id'])
            : null;

        $variantTitle = $variant ? $this->makeVariantTitle($variant) : null;

        // Анти-дубль: тот же телефон со статусом "new" за последние 2 часа — отдаём существующую запись.
        $existing = StockNotificationRequest::query()
            ->where('kind', StockNotificationRequest::KIND_CALLBACK)
            ->where('phone', $phone)
            ->where('status', 'new')
            ->where('created_at', '>=', now()->subHours(2))
            ->first();

        if ($existing) {
            return response()->json([
                'data' => new StockNotificationRequestResource($existing),
                'message' => 'Запрос уже принят — оператор свяжется с вами в ближайшее время.',
                'duplicate' => true,
            ], 200);
        }

        $user = $request->user();

        $record = StockNotificationRequest::query()->create([
            'kind' => StockNotificationRequest::KIND_CALLBACK,
            'user_id' => $user?->id,
            'product_id' => $product?->id,
            'variant_id' => $variant?->id,
            'product_name' => $product?->name,
            'variant_title' => $variantTitle,
            'phone' => $phone,
            'comment' => $comment,
            'status' => 'new',
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
        ]);

        return response()->json([
            'data' => new StockNotificationRequestResource($record),
            'message' => 'Спасибо! Запрос на звонок принят — мы перезвоним в ближайшее время.',
        ], 201);
    }

    protected function sanitizeComment(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $stripped = strip_tags($value);
        $normalized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $stripped ?? '');
        $collapsed = preg_replace("/\r\n?/", "\n", (string) $normalized);
        $trimmed = trim((string) $collapsed);

        if ($trimmed === '') {
            return null;
        }

        return mb_substr($trimmed, 0, 1000);
    }

    protected function makeVariantTitle(ProductVariantLink $variant): string
    {
        $parts = [];

        if ($variant->volume) {
            $parts[] = trim($variant->volume . ' ' . ($variant->volume_unit ?? ''));
        }

        if ($variant->concentration) {
            $parts[] = strtoupper((string) $variant->concentration);
        }

        if ($variant->edition) {
            $parts[] = (string) $variant->edition;
        }

        return !empty($parts)
            ? implode(' / ', $parts)
            : (string) ($variant->title ?? $variant->display_name ?? '');
    }
}
