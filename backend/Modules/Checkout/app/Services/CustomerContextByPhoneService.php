<?php

namespace Modules\Checkout\Services;

use App\Support\Phone;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\User;

final class CustomerContextByPhoneService
{
    /**
     * @return array{
     *     matched_user: array{id: int, name: string|null}|null,
     *     customer_name: string|null,
     *     orders: array{completed: int, cancelled: int, active: int}
     * }
     */
    public function resolveSummary(string $phone): array
    {
        $digits = Phone::normalize($phone);
        if (strlen($digits) < 7) {
            return [
                'matched_user' => null,
                'customer_name' => null,
                'orders' => ['completed' => 0, 'cancelled' => 0, 'active' => 0],
            ];
        }

        $suffix = strlen($digits) >= 9 ? substr($digits, -9) : $digits;

        $orderRows = Order::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderByDesc('id')
            ->limit(800)
            ->get(['id', 'status', 'phone', 'customer_name'])
            ->filter(fn (Order $order) => Phone::normalize((string) $order->phone) === $digits);

        $completed = $orderRows->whereIn('status', ['done', 'completed'])->count();
        $cancelled = $orderRows->where('status', 'cancelled')->count();
        $active = $orderRows->whereNotIn('status', ['done', 'completed', 'cancelled'])->count();

        $user = User::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (User $candidate) => Phone::normalize((string) $candidate->phone) === $digits);

        $customerName = null;
        if ($user && filled(trim((string) ($user->name ?? '')))) {
            $customerName = trim((string) $user->name);
        } else {
            $latestNamedOrder = $orderRows->first(
                fn (Order $order) => filled(trim((string) ($order->customer_name ?? '')))
            );
            if ($latestNamedOrder) {
                $customerName = trim((string) $latestNamedOrder->customer_name);
            }
        }

        return [
            'matched_user' => $user ? [
                'id' => (int) $user->id,
                'name' => $user->name,
            ] : null,
            'customer_name' => $customerName,
            'orders' => [
                'completed' => $completed,
                'cancelled' => $cancelled,
                'active' => $active,
            ],
        ];
    }
}
