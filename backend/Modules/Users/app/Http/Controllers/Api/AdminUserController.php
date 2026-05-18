<?php

namespace Modules\Users\Http\Controllers\Api;

use Illuminate\Database\Connection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Modules\Users\Models\User;
use Modules\Users\Enums\Role;

class AdminUserController extends Controller
{
    private const USER_SELECT = [
        'id',
        'name',
        'phone',
        'email',
        'role',
        'phone_verified_at',
    ];

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->get('search', ''));

        $users = User::query()
            ->with(['discountCards:id,card_number,discount_percent,status'])
            ->withCount('orders')
            ->when($search !== '', function ($query) use ($search) {
                $digitsSearch = preg_replace('/\D+/', '', $search) ?? '';
                $conn = $query->getConnection();
                $driver = $conn instanceof Connection
                    ? (string) ($conn->getConfig('driver') ?? '')
                    : '';

                $query->where(function ($subQuery) use ($search, $digitsSearch, $driver) {
                    $subQuery
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");

                    if ($digitsSearch !== '' && strlen($digitsSearch) >= 4) {
                        // Совпадение по цифрам номера (частичный ввод), если в БД есть пробелы/скобки
                        if ($driver === 'mysql') {
                            $subQuery->orWhereRaw(
                                "REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            );
                        } elseif ($driver === 'sqlite') {
                            $subQuery->orWhereRaw(
                                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            );
                        }
                    }
                });
            })
            ->latest('id')
            ->paginate(20);

        $userItems = collect($users->items());
        $phones = $userItems
            ->map(fn (User $user): string => $this->normalizePhone((string) ($user->phone ?? '')))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $ordersByPhone = [];
        if ($phones !== []) {
            $ordersByPhone = DB::table('orders')
                ->selectRaw('phone, COUNT(*) as c')
                ->whereIn('phone', $phones)
                ->groupBy('phone')
                ->pluck('c', 'phone')
                ->map(fn ($count): int => (int) $count)
                ->all();
        }

        $data = $userItems->map(function (User $user) use ($ordersByPhone): array {
            $normalizedPhone = $this->normalizePhone((string) ($user->phone ?? ''));
            $ordersCount = max(
                (int) ($user->orders_count ?? 0),
                $normalizedPhone !== '' ? (int) ($ordersByPhone[$normalizedPhone] ?? 0) : 0
            );

            return $this->toApiUser($user, $ordersCount);
        })->values()->all();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    public function updateRole(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['required', 'string', 'in:customer,admin,manager,ceo'],
        ]);

        $user = User::query()->findOrFail($id);

        $user->update([
            'role' => $validated['role'],
        ]);

        return response()->json([
            'data' => $user,
            'message' => 'Роль обновлена',
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $user = User::query()
            ->with(['discountCards:id,card_number,discount_percent,status'])
            ->withCount('orders')
            ->findOrFail($id);

        return response()->json([
            'data' => $this->toApiUser($user, $this->resolveOrdersCountForUser($user, (int) ($user->orders_count ?? 0))),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:32', Rule::unique('users', 'phone')],
            'role' => ['required', 'string', 'in:customer,admin,manager,ceo'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);

        $phone = $this->normalizePhone((string) ($validated['phone'] ?? ''));
        $email = trim((string) ($validated['email'] ?? ''));
        $password = (string) ($validated['password'] ?? '');

        $user = User::query()->create([
            'name' => trim((string) $validated['name']),
            'email' => $email !== '' ? mb_strtolower($email, 'UTF-8') : null,
            'phone' => $phone !== '' ? $phone : null,
            'role' => (string) $validated['role'],
            'password' => $password !== '' ? Hash::make($password) : Hash::make(bin2hex(random_bytes(16))),
        ]);

        $user->load(['discountCards:id,card_number,discount_percent,status']);

        return response()->json([
            'data' => $this->toApiUser($user, 0),
            'message' => 'Пользователь создан',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'phone' => [
                'nullable',
                'string',
                'max:32',
                Rule::unique('users', 'phone')->ignore($user->id),
            ],
            'role' => ['required', 'string', 'in:customer,admin,manager,ceo'],
            'password' => ['nullable', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        $phone = $this->normalizePhone((string) ($validated['phone'] ?? ''));
        $email = trim((string) ($validated['email'] ?? ''));
        $password = trim((string) ($validated['password'] ?? ''));

        $payload = [
            'name' => trim((string) $validated['name']),
            'email' => $email !== '' ? mb_strtolower($email, 'UTF-8') : null,
            'phone' => $phone !== '' ? $phone : null,
            'role' => (string) $validated['role'],
        ];

        if ($password !== '') {
            $payload['password'] = $password;
        }

        $user->update($payload);

        $user->load(['discountCards:id,card_number,discount_percent,status']);

        return response()->json([
            'data' => $this->toApiUser(
                $user,
                $this->resolveOrdersCountForUser($user, (int) DB::table('orders')->where('user_id', $user->id)->count())
            ),
            'message' => 'Пользователь обновлён',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::query()->findOrFail($id);
        $authUserId = (int) ($request->user()?->id ?? 0);
        if ($authUserId > 0 && $authUserId === (int) $user->id) {
            return response()->json([
                'message' => 'Нельзя удалить текущего авторизованного пользователя',
            ], 422);
        }

        $hasOrders = DB::table('orders')->where('user_id', $user->id)->exists();
        if ($hasOrders) {
            return response()->json([
                'message' => 'Нельзя удалить пользователя с заказами. Измените роль или профиль.',
            ], 422);
        }

        $user->delete();

        return response()->json([
            'message' => 'Пользователь удалён',
        ]);
    }

    public function ordersHistory(int $id): JsonResponse
    {
        $user = User::query()->findOrFail($id);
        $normalizedPhone = $this->normalizePhone((string) ($user->phone ?? ''));

        $orders = DB::table('orders')
            ->select(['id', 'created_at', 'items_qty', 'total', 'status'])
            ->when($normalizedPhone !== '', function ($query) use ($normalizedPhone, $user) {
                $query->where(function ($nested) use ($normalizedPhone, $user) {
                    $nested
                        ->where('user_id', $user->id)
                        ->orWhere('phone', $normalizedPhone);
                });
            }, fn ($query) => $query->where('user_id', $user->id))
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => $orders->map(static fn ($order): array => [
                'id' => (int) $order->id,
                'created_at' => (string) $order->created_at,
                'items_qty' => (int) ($order->items_qty ?? 0),
                'total' => (string) $order->total,
                'status' => (string) $order->status,
            ])->values()->all(),
        ]);
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    private function toApiUser(User $user, int $ordersCount): array
    {
        return [
            'id' => (int) $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
            'email' => $user->email,
            'role' => $user->role,
            'phone_verified_at' => $user->phone_verified_at?->toIso8601String(),
            'orders_count' => $ordersCount,
            'discount_cards' => $user->discountCards->map(fn ($card): array => [
                'id' => (int) $card->id,
                'number' => (string) $card->card_number,
                'discount_percent' => (int) $card->discount_percent,
                'status' => (string) $card->status,
            ])->values()->all(),
        ];
    }

    private function resolveOrdersCountForUser(User $user, int $ordersCountByUserId): int
    {
        $normalizedPhone = $this->normalizePhone((string) ($user->phone ?? ''));
        if ($normalizedPhone === '') {
            return $ordersCountByUserId;
        }

        $ordersCountByPhone = (int) DB::table('orders')
            ->where('phone', $normalizedPhone)
            ->count();

        return max($ordersCountByUserId, $ordersCountByPhone);
    }
}
