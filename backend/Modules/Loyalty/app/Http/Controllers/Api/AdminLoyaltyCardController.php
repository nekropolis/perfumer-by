<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Modules\Loyalty\Models\ClientDiscountCard;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Users\Models\Client;

class AdminLoyaltyCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));

        $items = DiscountCard::query()
            ->with('clients:id,name,phone')
            ->when($search !== '', fn ($q) => $q->where('card_number', 'like', "%{$search}%"))
            ->latest('id')
            ->paginate(20);

        $items->getCollection()->transform(function (DiscountCard $card): DiscountCard {
            $card->setAttribute('discount_percent', $card->resolvedDiscountPercent());
            $card->setRelation('users', $card->clients);

            return $card;
        });

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $isManual = $request->boolean('is_manual_discount');
        $maxPercent = $isManual
            ? DiscountCard::MAX_MANUAL_DISCOUNT_PERCENT
            : DiscountCard::MAX_DISCOUNT_PERCENT;

        $validated = $request->validate([
            'card_number' => ['nullable', 'string', 'max:64'],
            'number' => ['nullable', 'string', 'max:64'],
            'discount_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:'.$maxPercent,
            ],
            'is_manual_discount' => ['nullable', 'boolean'],
            'status' => ['nullable', 'string', 'in:active,blocked,expired'],
            'issued_at' => ['nullable', 'date'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string'],
        ], [
            'discount_percent.max' => $isManual
                ? 'При ручной установке скидка не должна превышать '.DiscountCard::MAX_MANUAL_DISCOUNT_PERCENT.'%.'
                : 'Процент скидки не должен превышать '.DiscountCard::MAX_DISCOUNT_PERCENT.'%.',
        ]);

        $cardNumber = trim((string) ($validated['card_number'] ?? $validated['number'] ?? ''));
        Validator::make(
            ['card_number' => $cardNumber],
            ['card_number' => ['required', 'string', 'max:64', 'unique:discount_cards,card_number']],
            ['card_number.required' => 'Укажите номер карты (card_number или number).'],
        )->validate();

        $item = DiscountCard::query()->create([
            'card_number' => $cardNumber,
            'is_manual_discount' => $isManual,
            'discount_percent' => DiscountCard::effectiveDiscountPercent(
                (float) ($validated['discount_percent'] ?? 3.0),
                $isManual
            ),
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
            ->with('clients:id,name,phone')
            ->findOrFail($id);
        $item->setAttribute('discount_percent', $item->resolvedDiscountPercent());
        $item->setRelation('users', $item->clients);

        return response()->json([
            'data' => $item,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = DiscountCard::query()->findOrFail($id);
        $isManual = $request->has('is_manual_discount')
            ? $request->boolean('is_manual_discount')
            : (bool) $item->is_manual_discount;
        $maxPercent = $isManual
            ? DiscountCard::MAX_MANUAL_DISCOUNT_PERCENT
            : DiscountCard::MAX_DISCOUNT_PERCENT;

        $validated = $request->validate([
            'discount_percent' => [
                'nullable',
                'numeric',
                'min:0',
                'max:'.$maxPercent,
            ],
            'is_manual_discount' => ['nullable', 'boolean'],
            'status' => ['nullable', 'string', 'in:active,blocked,expired'],
            'issued_at' => ['nullable', 'date'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string'],
        ], [
            'discount_percent.max' => $isManual
                ? 'При ручной установке скидка не должна превышать '.DiscountCard::MAX_MANUAL_DISCOUNT_PERCENT.'%.'
                : 'Процент скидки не должен превышать '.DiscountCard::MAX_DISCOUNT_PERCENT.'%.',
        ]);

        if (array_key_exists('is_manual_discount', $validated)) {
            $validated['is_manual_discount'] = $isManual;
        }

        if (array_key_exists('discount_percent', $validated) && $validated['discount_percent'] !== null) {
            $validated['discount_percent'] = DiscountCard::effectiveDiscountPercent(
                (float) $validated['discount_percent'],
                $isManual
            );
        } elseif (array_key_exists('is_manual_discount', $validated) && ! $isManual) {
            // При снятии ручного режима ограничиваем процент накоплением.
            $validated['discount_percent'] = DiscountCard::effectiveDiscountPercent(
                (float) $item->discount_percent,
                false
            );
        }

        $item->update($validated);
        app(AuditLogService::class)->record('discount_card', (int) $item->id, AuditLogService::ACTION_UPDATED, 'Обновлена скидочная карта');

        $item->load('clients:id,name,phone');
        $item->refresh();
        $item->setAttribute('discount_percent', $item->resolvedDiscountPercent());
        $item->setRelation('users', $item->clients);

        return response()->json(['data' => $item]);
    }

    public function attachUser(Request $request, int $id): JsonResponse
    {
        $card = DiscountCard::query()->findOrFail($id);
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:clients,id'],
        ]);

        $client = Client::query()->findOrFail((int) $validated['user_id']);
        DB::transaction(function () use ($card, $client) {
            $client->discountCards()
                ->where('discount_cards.id', '<>', $card->id)
                ->wherePivot('link_status', ClientDiscountCard::LINK_VERIFIED)
                ->detach();

            $card->clients()->syncWithoutDetaching([
                $client->id => [
                    'linked_at' => now(),
                    'verified_at' => now(),
                    'is_primary' => false,
                    'source' => ClientDiscountCard::SOURCE_MANAGER,
                    'link_status' => ClientDiscountCard::LINK_VERIFIED,
                ],
            ]);
        });

        app(AuditLogService::class)->record('discount_card', (int) $card->id, AuditLogService::ACTION_UPDATED, 'Карта привязана к пользователю');

        $card = $card->fresh('clients:id,name,phone');
        $card->setRelation('users', $card->clients);

        return response()->json(['data' => $card]);
    }

    public function detachUser(int $id, int $userId): JsonResponse
    {
        $card = DiscountCard::query()->findOrFail($id);
        Client::query()->findOrFail($userId);

        $card->clients()->detach($userId);

        app(AuditLogService::class)->record(
            'discount_card',
            (int) $card->id,
            AuditLogService::ACTION_UPDATED,
            'Пользователь отвязан от скидочной карты',
            ['client_id' => $userId],
        );

        $card = $card->fresh('clients:id,name,phone');
        $card->setRelation('users', $card->clients);

        return response()->json(['data' => $card]);
    }
}
