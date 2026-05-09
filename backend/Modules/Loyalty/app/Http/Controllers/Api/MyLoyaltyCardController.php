<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\UserDiscountCard;

class MyLoyaltyCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user, 401);

        $items = $user->discountCards()
            ->withPivot(['link_status', 'linked_at', 'verified_at', 'source', 'is_primary'])
            ->orderByDesc('discount_percent')
            ->get();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function attachByNumber(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user, 401);

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

        $already = $user->discountCards()->where('discount_cards.id', $card->id)->first();
        if ($already) {
            $status = (string) $already->pivot->link_status;
            $message = match ($status) {
                UserDiscountCard::LINK_VERIFIED => 'Карта уже привязана к вашему аккаунту',
                UserDiscountCard::LINK_PENDING_CONFLICT => 'Заявка уже отправлена. Обратитесь в поддержку для разрешения конфликта.',
                default => 'Связь с этой картой уже существует',
            };

            return response()->json([
                'data' => $card->fresh(),
                'link_status' => $status,
                'message' => $message,
            ]);
        }

        $hasOtherVerifiedCard = $user->discountCards()
            ->where('discount_cards.id', '<>', $card->id)
            ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
            ->exists();

        if ($hasOtherVerifiedCard) {
            return response()->json([
                'message' => 'К вашему аккаунту уже привязана другая карта. У клиента может быть только одна карта.',
                'link_status' => UserDiscountCard::LINK_REJECTED,
                'code' => 'USER_ALREADY_HAS_DISCOUNT_CARD',
            ], 422);
        }

        $user->discountCards()->attach($card->id, [
            'linked_at' => now(),
            'verified_at' => now(),
            'is_primary' => false,
            'source' => UserDiscountCard::SOURCE_REGISTRATION,
            'link_status' => UserDiscountCard::LINK_VERIFIED,
        ]);

        return response()->json([
            'data' => $card->fresh(),
            'link_status' => UserDiscountCard::LINK_VERIFIED,
            'message' => 'Карта привязана',
        ]);
    }
}
