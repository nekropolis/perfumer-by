<?php

namespace Modules\Users\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\PhoneVerification;
use Modules\Users\Models\User;

class AuthController extends Controller
{
    public function requestCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', "regex:" . Phone::REGEX],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $code = (string) random_int(1000, 9999);

        PhoneVerification::query()->create([
            'phone' => $phone,
            'code' => $code,
            'expires_at' => now()->addMinutes(10),
            'verified_at' => null,
        ]);

        return response()->json([
            'message' => 'Verification code generated',
            'dev_code' => $code,
            'phone' => $phone,
        ]);
    }

    public function verifyCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'code' => ['required', 'string', 'max:10'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);

        $verification = PhoneVerification::query()
            ->where('phone', $phone)
            ->where('code', $validated['code'])
            ->whereNull('verified_at')
            ->latest('id')
            ->first();

        abort_if(!$verification, 422, 'Invalid verification code');
        abort_if($verification->expires_at->isPast(), 422, 'Verification code expired');

        $verification->update([
            'verified_at' => now(),
        ]);

        $user = User::query()->firstOrCreate(
            ['phone' => $phone],
            [
                'name' => $validated['name'] ?? 'Пользователь',
                'email' => $phone . '@phone.local',
                'password' => bcrypt(bin2hex(random_bytes(16))),
                'phone_verified_at' => now(),
            ]
        );

        if (!$user->phone_verified_at) {
            $user->update([
                'phone_verified_at' => now(),
            ]);
        }

        if (($validated['name'] ?? null) && !$user->name) {
            $user->update([
                'name' => $validated['name'],
            ]);
        }

        $this->attachOrdersToUser($user, $phone);
        $token = $user->createToken('frontend')->plainTextToken;

        return response()->json([
            'message' => 'Authenticated',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user(),
        ]);
    }

    protected function normalizePhone(string $phone): string
    {
        $normalized = preg_replace('/\D+/', '', $phone) ?? '';
        return $normalized;
    }

    protected function attachOrdersToUser(User $user, string $phone): void
    {
        Order::query()
            ->whereNull('user_id')
            ->where('phone', $phone)
            ->update([
                'user_id' => $user->id,
            ]);
    }
}
