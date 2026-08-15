<?php

namespace Modules\Users\Http\Controllers\Api;

use Illuminate\Database\Connection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Modules\Users\Models\Client;

class AdminClientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->get('search', ''));

        $clients = Client::query()
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
                        ->orWhere('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('patronymic', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('additional_phone', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");

                    if ($digitsSearch !== '' && strlen($digitsSearch) >= 4) {
                        if ($driver === 'mysql') {
                            $subQuery->orWhereRaw(
                                "REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            )->orWhereRaw(
                                "REGEXP_REPLACE(COALESCE(additional_phone, ''), '[^0-9]', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            );
                        } elseif ($driver === 'sqlite') {
                            $subQuery->orWhereRaw(
                                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            )->orWhereRaw(
                                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(additional_phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?",
                                ['%'.$digitsSearch.'%']
                            );
                        }
                    }
                });
            })
            ->latest('id')
            ->paginate(20);

        $clientItems = collect($clients->items());
        $phones = $clientItems
            ->map(fn (Client $client): string => $this->normalizePhone((string) ($client->phone ?? '')))
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

        $data = $clientItems->map(function (Client $client) use ($ordersByPhone): array {
            $normalizedPhone = $this->normalizePhone((string) ($client->phone ?? ''));
            $ordersCount = max(
                (int) ($client->orders_count ?? 0),
                $normalizedPhone !== '' ? (int) ($ordersByPhone[$normalizedPhone] ?? 0) : 0
            );

            return $this->toApiClient($client, $ordersCount);
        })->values()->all();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $clients->currentPage(),
                'last_page' => $clients->lastPage(),
                'per_page' => $clients->perPage(),
                'total' => $clients->total(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $client = Client::query()
            ->with(['discountCards:id,card_number,discount_percent,status'])
            ->withCount('orders')
            ->findOrFail($id);

        return response()->json([
            'data' => $this->toApiClient($client, $this->resolveOrdersCountForClient($client, (int) ($client->orders_count ?? 0))),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'patronymic' => ['nullable', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date', 'before_or_equal:today'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('clients', 'email')],
            'phone' => ['required', 'string', 'max:32', Rule::unique('clients', 'phone')],
            'additional_phone' => ['nullable', 'string', 'max:32'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);

        $phone = $this->normalizePhone((string) $validated['phone']);
        $additionalPhone = $this->normalizeOptionalPhone((string) ($validated['additional_phone'] ?? ''));
        $email = trim((string) ($validated['email'] ?? ''));
        $password = (string) ($validated['password'] ?? '');

        $client = Client::query()->create([
            ...$this->profilePayload($validated),
            'email' => $email !== '' ? mb_strtolower($email, 'UTF-8') : $phone.'@phone.local',
            'phone' => $phone,
            'additional_phone' => $additionalPhone,
            'password' => $password !== '' ? Hash::make($password) : Hash::make(bin2hex(random_bytes(16))),
            'phone_verified_at' => now(),
        ]);

        $client->load(['discountCards:id,card_number,discount_percent,status']);

        return response()->json([
            'data' => $this->toApiClient($client, 0),
            'message' => 'Клиент создан',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $client = Client::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'patronymic' => ['nullable', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date', 'before_or_equal:today'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('clients', 'email')->ignore($client->id),
            ],
            'phone' => [
                'required',
                'string',
                'max:32',
                Rule::unique('clients', 'phone')->ignore($client->id),
            ],
            'additional_phone' => ['nullable', 'string', 'max:32'],
            'password' => ['nullable', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        $phone = $this->normalizePhone((string) $validated['phone']);
        $additionalPhone = $this->normalizeOptionalPhone((string) ($validated['additional_phone'] ?? ''));
        $email = trim((string) ($validated['email'] ?? ''));
        $password = trim((string) ($validated['password'] ?? ''));

        $payload = [
            ...$this->profilePayload($validated),
            'email' => $email !== '' ? mb_strtolower($email, 'UTF-8') : $phone.'@phone.local',
            'phone' => $phone,
            'additional_phone' => $additionalPhone,
        ];

        if ($password !== '') {
            $payload['password'] = $password;
        }

        $client->update($payload);
        $client->load(['discountCards:id,card_number,discount_percent,status']);

        return response()->json([
            'data' => $this->toApiClient(
                $client,
                $this->resolveOrdersCountForClient($client, (int) DB::table('orders')->where('client_id', $client->id)->count())
            ),
            'message' => 'Клиент обновлён',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $client = Client::query()->findOrFail($id);

        $hasOrders = DB::table('orders')->where('client_id', $client->id)->exists();
        if ($hasOrders) {
            return response()->json([
                'message' => 'Нельзя удалить клиента с заказами.',
            ], 422);
        }

        $client->delete();

        return response()->json([
            'message' => 'Клиент удалён',
        ]);
    }

    public function ordersHistory(int $id): JsonResponse
    {
        $client = Client::query()->findOrFail($id);
        $normalizedPhone = $this->normalizePhone((string) ($client->phone ?? ''));

        $orders = DB::table('orders')
            ->select(['id', 'created_at', 'items_qty', 'total', 'status'])
            ->when($normalizedPhone !== '', function ($query) use ($normalizedPhone, $client) {
                $query->where(function ($nested) use ($normalizedPhone, $client) {
                    $nested
                        ->where('client_id', $client->id)
                        ->orWhere('phone', $normalizedPhone);
                });
            }, fn ($query) => $query->where('client_id', $client->id))
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

    private function normalizeOptionalPhone(string $phone): ?string
    {
        $normalized = $this->normalizePhone($phone);

        return $normalized !== '' ? $normalized : null;
    }

    private function toApiClient(Client $client, int $ordersCount): array
    {
        return [
            'id' => (int) $client->id,
            'name' => $client->displayName(),
            'first_name' => $client->first_name,
            'last_name' => $client->last_name,
            'patronymic' => $client->patronymic,
            'birth_date' => $client->birth_date?->format('Y-m-d'),
            'phone' => $client->phone,
            'additional_phone' => $client->additional_phone,
            'email' => $client->profileEmail() ?? $client->email,
            'phone_verified_at' => $client->phone_verified_at?->toIso8601String(),
            'orders_count' => $ordersCount,
            'discount_cards' => $client->discountCards->map(fn ($card): array => [
                'id' => (int) $card->id,
                'number' => (string) $card->card_number,
                'discount_percent' => (int) $card->discount_percent,
                'status' => (string) $card->status,
            ])->values()->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function profilePayload(array $validated): array
    {
        $firstName = trim((string) ($validated['first_name'] ?? ''));
        $lastName = trim((string) ($validated['last_name'] ?? ''));
        $patronymic = trim((string) ($validated['patronymic'] ?? ''));

        $displayName = trim(implode(' ', array_filter([$firstName, $patronymic, $lastName])));
        if ($displayName === '') {
            $displayName = trim((string) ($validated['name'] ?? ''));
        }
        if ($displayName === '') {
            $displayName = 'Клиент';
        }

        return [
            'name' => $displayName,
            'first_name' => $firstName !== '' ? $firstName : null,
            'last_name' => $lastName !== '' ? $lastName : null,
            'patronymic' => $patronymic !== '' ? $patronymic : null,
            'birth_date' => $validated['birth_date'] ?? null,
        ];
    }

    private function resolveOrdersCountForClient(Client $client, int $ordersCountByClientId): int
    {
        $normalizedPhone = $this->normalizePhone((string) ($client->phone ?? ''));
        if ($normalizedPhone === '') {
            return $ordersCountByClientId;
        }

        $ordersCountByPhone = (int) DB::table('orders')
            ->where('phone', $normalizedPhone)
            ->count();

        return max($ordersCountByClientId, $ordersCountByPhone);
    }
}
