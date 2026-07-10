<?php

namespace Modules\Checkout\Support;

use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\Client;

/**
 * Заказы, доступные клиенту в ЛК: по client_id и по совпадению телефона (гостевые и админские).
 */
final class OrderAccountScope
{
    public static function queryForClient(Client $client): Builder
    {
        $normalizedPhone = Phone::normalize((string) ($client->phone ?? ''));

        return Order::query()->where(function (Builder $query) use ($client, $normalizedPhone) {
            $query->where('client_id', $client->id);
            if ($normalizedPhone !== '') {
                $query->orWhere('phone', $normalizedPhone);
            }
        });
    }

    public static function clientCanAccess(Order $order, Client $client): bool
    {
        if ((int) $order->client_id === (int) $client->id) {
            return true;
        }

        $normalizedPhone = Phone::normalize((string) ($client->phone ?? ''));
        if ($normalizedPhone === '') {
            return false;
        }

        return Phone::normalize((string) $order->phone) === $normalizedPhone;
    }

    public static function resolveClientIdForPhone(string $phone): ?int
    {
        $normalizedPhone = Phone::normalize($phone);
        if ($normalizedPhone === '') {
            return null;
        }

        $exact = Client::query()
            ->where('phone', $normalizedPhone)
            ->orderBy('id')
            ->first();
        if ($exact) {
            return (int) $exact->id;
        }

        $suffix = strlen($normalizedPhone) >= 9 ? substr($normalizedPhone, -9) : $normalizedPhone;
        if ($suffix === '') {
            return null;
        }

        $matched = Client::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (Client $candidate) => Phone::normalize((string) $candidate->phone) === $normalizedPhone);

        return $matched ? (int) $matched->id : null;
    }

    /** Привязать гостевые заказы с тем же телефоном к аккаунту (вход, регистрация, /me). */
    public static function linkOrdersForClient(Client $client): int
    {
        $phone = Phone::normalize((string) ($client->phone ?? ''));
        if ($phone === '') {
            return 0;
        }

        $linked = Order::query()
            ->whereNull('client_id')
            ->where('phone', $phone)
            ->update([
                'client_id' => $client->id,
            ]);

        $suffix = strlen($phone) >= 9 ? substr($phone, -9) : $phone;
        if ($suffix === '') {
            return (int) $linked;
        }

        $candidateIds = Order::query()
            ->whereNull('client_id')
            ->where('phone', 'like', '%'.$suffix.'%')
            ->latest('id')
            ->limit(1000)
            ->pluck('id');

        if ($candidateIds->isEmpty()) {
            return (int) $linked;
        }

        $legacyIds = Order::query()
            ->whereIn('id', $candidateIds)
            ->get(['id', 'phone'])
            ->filter(fn (Order $order) => Phone::normalize((string) $order->phone) === $phone)
            ->pluck('id')
            ->all();

        if ($legacyIds === []) {
            return (int) $linked;
        }

        $legacyLinked = Order::query()
            ->whereNull('client_id')
            ->whereIn('id', $legacyIds)
            ->update([
                'client_id' => $client->id,
            ]);

        return (int) $linked + (int) $legacyLinked;
    }
}
