<?php

namespace Modules\Communications\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Modules\Communications\Models\IncomingCallDevice;
use Modules\Users\Models\User;

class IncomingCallDeviceController extends Controller
{
    public function managers(): JsonResponse
    {
        $managers = User::query()
            ->whereIn('role', ['admin', 'manager', 'ceo'])
            ->orderBy('name')
            ->orderBy('id')
            ->get(['id', 'name', 'phone', 'email', 'role'])
            ->map(static fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'email' => $user->email,
                'role' => (string) $user->role,
            ])
            ->values()
            ->all();

        return response()->json(['data' => $managers]);
    }

    public function index(): JsonResponse
    {
        $devices = IncomingCallDevice::query()
            ->with(['manager:id,name,phone,role'])
            ->orderBy('label')
            ->get()
            ->map(fn (IncomingCallDevice $device): array => $this->toApiDevice($device))
            ->values()
            ->all();

        return response()->json(['data' => $devices]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:100'],
            'manager_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
        ]);

        $manager = User::query()->findOrFail((int) $validated['manager_user_id']);
        if (! in_array((string) $manager->role, ['admin', 'manager', 'ceo'], true)) {
            return response()->json([
                'message' => 'Manager must have admin, manager, or ceo role.',
            ], 422);
        }

        $device = IncomingCallDevice::query()->create([
            'id' => (string) Str::uuid(),
            'manager_user_id' => (int) $manager->id,
            'label' => trim((string) $validated['label']),
            'is_active' => true,
        ]);

        $plainToken = $this->issueDeviceToken($device, $manager);

        return response()->json([
            'data' => $this->toApiDevice($device->fresh(['manager:id,name,phone,role'])),
            'token' => $plainToken,
        ], 201);
    }

    public function regenerateToken(string $id): JsonResponse
    {
        $device = IncomingCallDevice::query()->with('manager')->findOrFail($id);
        $manager = $device->manager;

        if ($manager === null) {
            return response()->json(['message' => 'Manager not found.'], 422);
        }

        $plainToken = $this->issueDeviceToken($device, $manager);

        return response()->json([
            'data' => $this->toApiDevice($device->fresh(['manager:id,name,phone,role'])),
            'token' => $plainToken,
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $device = IncomingCallDevice::query()->findOrFail($id);

        $validated = $request->validate([
            'label' => ['sometimes', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $device->fill($validated)->save();

        return response()->json([
            'data' => $this->toApiDevice($device->fresh(['manager:id,name,phone,role'])),
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $device = IncomingCallDevice::query()->findOrFail($id);

        if ($device->personal_access_token_id) {
            $device->manager?->tokens()
                ->where('id', $device->personal_access_token_id)
                ->delete();
        }

        $device->delete();

        return response()->json(['success' => true]);
    }

    private function issueDeviceToken(IncomingCallDevice $device, User $manager): string
    {
        if ($device->personal_access_token_id) {
            $manager->tokens()
                ->where('id', $device->personal_access_token_id)
                ->delete();
        }

        $token = $manager->createToken(
            'incoming-call-device:'.$device->id,
            ['incoming-call:send-to-crm']
        );

        $device->forceFill([
            'personal_access_token_id' => $token->accessToken->id,
        ])->save();

        return $token->plainTextToken;
    }

    /**
     * @return array<string, mixed>
     */
    private function toApiDevice(IncomingCallDevice $device): array
    {
        return [
            'id' => (string) $device->id,
            'label' => (string) $device->label,
            'is_active' => (bool) $device->is_active,
            'last_seen_at' => $device->last_seen_at?->toIso8601String(),
            'manager' => $device->manager ? [
                'id' => (int) $device->manager->id,
                'name' => $device->manager->name,
                'phone' => $device->manager->phone,
                'role' => $device->manager->role,
            ] : null,
        ];
    }
}
