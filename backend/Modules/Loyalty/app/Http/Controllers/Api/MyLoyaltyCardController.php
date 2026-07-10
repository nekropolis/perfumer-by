<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\ClientDiscountCard;

class MyLoyaltyCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $client = $request->user();
        abort_if(! $client, 401);

        $items = $client->discountCards()
            ->withPivot(['link_status', 'linked_at', 'verified_at', 'source', 'is_primary'])
            ->orderByDesc('discount_percent')
            ->get();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function attachByNumber(Request $request): JsonResponse
    {
        $client = $request->user();
        abort_if(! $client, 401);

        $validated = $request->validate([
            'number' => ['required', 'string', 'max:64'],
        ]);

        $number = trim($validated['number']);

        $card = DiscountCard::query()
            ->where('card_number', $number)
            ->first();

        if (!$card) {
            return response()->json([
                'message' => 'Такой карты лояльности нет, проверьте номер.',
                'code' => 'DISCOUNT_CARD_NOT_FOUND',
            ], 404);
        }

        if ($card->status !== DiscountCard::STATUS_ACTIVE) {
            return response()->json([
                'message' => 'Карта недействительна, свяжитесь с менеджером магазина.',
                'code' => 'DISCOUNT_CARD_INACTIVE',
            ], 422);
        }

        $already = $client->discountCards()->where('discount_cards.id', $card->id)->first();
        if ($already) {
            $status = (string) $already->pivot->link_status;
            $message = match ($status) {
                ClientDiscountCard::LINK_VERIFIED => 'Карта уже привязана к вашему аккаунту',
                ClientDiscountCard::LINK_PENDING_CONFLICT => 'Заявка уже отправлена. Обратитесь в поддержку для разрешения конфликта.',
                default => 'Связь с этой картой уже существует',
            };

            return response()->json([
                'data' => $card->fresh(),
                'link_status' => $status,
                'message' => $message,
            ]);
        }

        $hasOtherVerifiedCard = $client->discountCards()
            ->where('discount_cards.id', '<>', $card->id)
            ->wherePivot('link_status', ClientDiscountCard::LINK_VERIFIED)
            ->exists();

        if ($hasOtherVerifiedCard) {
            return response()->json([
                'message' => 'К вашему аккаунту уже привязана другая карта. У клиента может быть только одна карта.',
                'link_status' => ClientDiscountCard::LINK_REJECTED,
                'code' => 'USER_ALREADY_HAS_DISCOUNT_CARD',
            ], 422);
        }

        $client->discountCards()->attach($card->id, [
            'linked_at' => now(),
            'verified_at' => now(),
            'is_primary' => false,
            'source' => ClientDiscountCard::SOURCE_REGISTRATION,
            'link_status' => ClientDiscountCard::LINK_VERIFIED,
        ]);

        return response()->json([
            'data' => $card->fresh(),
            'link_status' => ClientDiscountCard::LINK_VERIFIED,
            'message' => 'Карта привязана',
        ]);
    }
}
