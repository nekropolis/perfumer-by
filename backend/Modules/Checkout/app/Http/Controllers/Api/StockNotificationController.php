<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Communications\Services\Notifications\CheckoutTelegramNotificationService;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Checkout\Http\Resources\StockNotificationRequestResource;
use Modules\Checkout\Models\StockNotificationRequest;

class StockNotificationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
            'phone' => ['required', 'string', 'max:64'],
            'phone_plain_digits' => ['sometimes', 'boolean'],
            'comment' => ['nullable', 'string', 'max:1000'],
            'consent_privacy' => ['accepted'],
        ]);

        Phone::assertValidFlexible(
            $validated['phone'],
            (bool) ($validated['phone_plain_digits'] ?? false),
        );

        $phone = Phone::normalize($validated['phone']);
        $comment = $this->sanitizeComment($validated['comment'] ?? null);

        $product = Product::query()->find($validated['product_id']);
        $variant = !empty($validated['variant_id'])
            ? ProductVariantLink::query()->with('definition')->find($validated['variant_id'])
            : null;

        $variantTitle = $variant ? $this->makeVariantTitle($variant) : null;

        $existing = StockNotificationRequest::query()
            ->where('kind', StockNotificationRequest::KIND_BACK_IN_STOCK)
            ->where('product_id', $validated['product_id'])
            ->where('variant_id', $validated['variant_id'] ?? null)
            ->where('phone', $phone)
            ->where('status', 'new')
            ->where('created_at', '>=', now()->subDay())
            ->first();

        if ($existing) {
            return response()->json([
                'data' => new StockNotificationRequestResource($existing),
                'message' => 'Запрос уже принят — мы напишем, как только товар появится.',
                'duplicate' => true,
            ], 200);
        }

        $client = $request->user();
        $client = $client instanceof \Modules\Users\Models\Client ? $client : null;

        $record = StockNotificationRequest::query()->create([
            'kind' => StockNotificationRequest::KIND_BACK_IN_STOCK,
            'client_id' => $client?->id,
            'product_id' => $validated['product_id'],
            'variant_id' => $validated['variant_id'] ?? null,
            'product_name' => $product
                ? \Modules\Catalog\Support\ProductDisplayName::forProduct($product)
                : null,
            'variant_title' => $variantTitle,
            'phone' => $phone,
            'comment' => $comment,
            'status' => 'new',
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
        ]);
        app(CheckoutTelegramNotificationService::class)->notifyCustomerRequest($record);

        return response()->json([
            'data' => new StockNotificationRequestResource($record),
            'message' => 'Спасибо! Уведомление о поступлении принято.',
        ], 201);
    }

    protected function sanitizeComment(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        // Удаляем любую HTML-разметку и управляющие символы — защита от XSS/скриптов.
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
