<?php

namespace Modules\Users\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;

class AdminUserController extends Controller
{
    private const STAFF_ROLES = ['admin', 'manager', 'ceo'];

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->get('search', ''));

        $users = User::query()
            ->whereIn('role', self::STAFF_ROLES)
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    $subQuery
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->latest('id')
            ->paginate(20);

        $data = collect($users->items())->map(fn (User $user): array => $this->toApiUser($user))->values()->all();

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
            'role' => ['required', 'string', 'in:admin,manager,ceo'],
        ]);

        $user = User::query()->whereIn('role', self::STAFF_ROLES)->findOrFail($id);
        $user->update(['role' => $validated['role']]);

        return response()->json([
            'data' => $this->toApiUser($user),
            'message' => 'Роль обновлена',
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $user = User::query()->whereIn('role', self::STAFF_ROLES)->findOrFail($id);

        return response()->json([
            'data' => $this->toApiUser($user),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:32', Rule::unique('users', 'phone')],
            'role' => ['required', 'string', 'in:admin,manager,ceo'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);

        $phone = $this->normalizePhone((string) ($validated['phone'] ?? ''));
        $email = mb_strtolower(trim((string) $validated['email']), 'UTF-8');
        $password = (string) ($validated['password'] ?? '');

        $user = User::query()->create([
            'name' => trim((string) $validated['name']),
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'role' => (string) $validated['role'],
            'password' => $password !== '' ? Hash::make($password) : Hash::make(bin2hex(random_bytes(16))),
        ]);

        return response()->json([
            'data' => $this->toApiUser($user),
            'message' => 'Пользователь создан',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::query()->whereIn('role', self::STAFF_ROLES)->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
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
            'role' => ['required', 'string', 'in:admin,manager,ceo'],
            'password' => ['nullable', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        $phone = $this->normalizePhone((string) ($validated['phone'] ?? ''));
        $email = mb_strtolower(trim((string) $validated['email']), 'UTF-8');
        $password = trim((string) ($validated['password'] ?? ''));

        $payload = [
            'name' => trim((string) $validated['name']),
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'role' => (string) $validated['role'],
        ];

        if ($password !== '') {
            $payload['password'] = $password;
        }

        $user->update($payload);

        return response()->json([
            'data' => $this->toApiUser($user),
            'message' => 'Пользователь обновлён',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::query()->whereIn('role', self::STAFF_ROLES)->findOrFail($id);
        $authUser = $request->user();

        if ($authUser instanceof User && (int) $authUser->id === (int) $user->id) {
            return response()->json([
                'message' => 'Нельзя удалить текущего авторизованного пользователя',
            ], 422);
        }

        $user->delete();

        return response()->json([
            'message' => 'Пользователь удалён',
        ]);
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    private function toApiUser(User $user): array
    {
        return [
            'id' => (int) $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
            'email' => $user->email,
            'role' => $user->role,
        ];
    }
}
