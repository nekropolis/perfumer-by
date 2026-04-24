<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\UserDiscountCard;

class AdminLoyaltyCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));

        $items = DiscountCard::query()
            ->with('users:id,name,phone')
            ->when($search !== '', fn ($q) => $q->where('card_number', 'like', "%{$search}%"))
            ->latest('id')
            ->paginate(20);

        $items->getCollection()->transform(static function (DiscountCard $card): DiscountCard {
            $card->setAttribute(
                'discount_percent',
                DiscountCard::effectiveDiscountPercent((float) $card->discount_percent)
            );

            return $card;
        });

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'card_number' => ['nullable', 'string', 'max:64'],
            'number' => ['nullable', 'string', 'max:64'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:'.DiscountCard::MAX_DISCOUNT_PERCENT],
            'status' => ['nullable', 'string', 'in:active,blocked,expired'],
            'issued_at' => ['nullable', 'date'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string'],
        ]);

        $cardNumber = trim((string) ($validated['card_number'] ?? $validated['number'] ?? ''));
        Validator::make(
            ['card_number' => $cardNumber],
            ['card_number' => ['required', 'string', 'max:64', 'unique:discount_cards,card_number']],
            ['card_number.required' => 'Укажите номер карты (card_number или number).'],
        )->validate();

        $item = DiscountCard::query()->create([
            'card_number' => $cardNumber,
            'discount_percent' => DiscountCard::effectiveDiscountPercent((float) ($validated['discount_percent'] ?? 3.0)),
            'status' => $validated['status'] ?? DiscountCard::STATUS_ACTIVE,
            'issued_at' => $validated['issued_at'] ?? null,
            'owner_name' => $validated['owner_name'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ]);

        app(AuditLogService::class)->record('discount_card', (int) $item->id, AuditLogService::ACTION_CREATED, 'Создана скидочная карта');

        return response()->json(['data' => $item], 201);
    }

    public function show(int $id): JsonResponse
    {
        $item = DiscountCard::query()
            ->with('users:id,name,phone')
            ->findOrFail($id);
        $item->setAttribute(
            'discount_percent',
            DiscountCard::effectiveDiscountPercent((float) $item->discount_percent)
        );

        return response()->json([
            'data' => $item,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = DiscountCard::query()->findOrFail($id);
        $validated = $request->validate([
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:'.DiscountCard::MAX_DISCOUNT_PERCENT],
            'status' => ['nullable', 'string', 'in:active,blocked,expired'],
            'issued_at' => ['nullable', 'date'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string'],
        ]);

        if (array_key_exists('discount_percent', $validated) && $validated['discount_percent'] !== null) {
            $validated['discount_percent'] = DiscountCard::effectiveDiscountPercent((float) $validated['discount_percent']);
        }

        $item->update($validated);
        app(AuditLogService::class)->record('discount_card', (int) $item->id, AuditLogService::ACTION_UPDATED, 'Обновлена скидочная карта');

        $item->load('users:id,name,phone');
        $item->refresh();
        $item->setAttribute(
            'discount_percent',
            DiscountCard::effectiveDiscountPercent((float) $item->discount_percent)
        );

        return response()->json(['data' => $item]);
    }

    public function attachUser(Request $request, int $id): JsonResponse
    {
        $card = DiscountCard::query()->findOrFail($id);
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = User::query()->findOrFail((int) $validated['user_id']);
        $card->users()->syncWithoutDetaching([
            $user->id => [
                'linked_at' => now(),
                'verified_at' => now(),
                'is_primary' => false,
                'source' => UserDiscountCard::SOURCE_MANAGER,
                'link_status' => UserDiscountCard::LINK_VERIFIED,
            ],
        ]);

        app(AuditLogService::class)->record('discount_card', (int) $card->id, AuditLogService::ACTION_UPDATED, 'Карта привязана к пользователю');

        return response()->json(['data' => $card->fresh('users:id,name,phone')]);
    }

    public function detachUser(int $id, int $userId): JsonResponse
    {
        $card = DiscountCard::query()->findOrFail($id);
        User::query()->findOrFail($userId);

        $card->users()->detach($userId);

        app(AuditLogService::class)->record(
            'discount_card',
            (int) $card->id,
            AuditLogService::ACTION_UPDATED,
            'Пользователь отвязан от скидочной карты',
            ['user_id' => $userId],
        );

        return response()->json(['data' => $card->fresh('users:id,name,phone')]);
    }
}
