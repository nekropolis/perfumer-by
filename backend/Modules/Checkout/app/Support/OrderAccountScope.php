<?php

namespace Modules\Checkout\Support;

use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\User;

/**
 * Заказы, доступные клиенту в ЛК: по user_id и по совпадению телефона (гостевые и админские).
 */
final class OrderAccountScope
{
    public static function queryForUser(User $user): Builder
    {
        $normalizedPhone = Phone::normalize((string) ($user->phone ?? ''));

        return Order::query()->where(function (Builder $query) use ($user, $normalizedPhone) {
            $query->where('user_id', $user->id);
            if ($normalizedPhone !== '') {
                $query->orWhere('phone', $normalizedPhone);
            }
        });
    }

    public static function userCanAccess(Order $order, User $user): bool
    {
        if ((int) $order->user_id === (int) $user->id) {
            return true;
        }

        $normalizedPhone = Phone::normalize((string) ($user->phone ?? ''));
        if ($normalizedPhone === '') {
            return false;
        }

        return Phone::normalize((string) $order->phone) === $normalizedPhone;
    }

    public static function resolveUserIdForPhone(string $phone): ?int
    {
        $normalizedPhone = Phone::normalize($phone);
        if ($normalizedPhone === '') {
            return null;
        }

        $exact = User::query()
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

        $matched = User::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (User $candidate) => Phone::normalize((string) $candidate->phone) === $normalizedPhone);

        return $matched ? (int) $matched->id : null;
    }

    /** Привязать гостевые заказы с тем же телефоном к аккаунту (вход, регистрация, /me). */
    public static function linkOrdersForUser(User $user): int
    {
        $phone = Phone::normalize((string) ($user->phone ?? ''));
        if ($phone === '') {
            return 0;
        }

        $linked = Order::query()
            ->whereNull('user_id')
            ->where('phone', $phone)
            ->update([
                'user_id' => $user->id,
            ]);

        $suffix = strlen($phone) >= 9 ? substr($phone, -9) : $phone;
        if ($suffix === '') {
            return (int) $linked;
        }

        $candidateIds = Order::query()
            ->whereNull('user_id')
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
            ->whereNull('user_id')
            ->whereIn('id', $legacyIds)
            ->update([
                'user_id' => $user->id,
            ]);

        return (int) $linked + (int) $legacyLinked;
    }
}
