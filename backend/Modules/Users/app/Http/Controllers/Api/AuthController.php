<?php

namespace Modules\Users\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\PhoneVerification;
use Modules\Users\Models\User;

class AuthController extends Controller
{
    public function requestCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', "regex:" . Phone::REGEX],
            'captcha_token' => ['nullable', 'string', 'max:4096'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $this->ensureRequestCodeAllowed($request, $phone);
        $code = (string) random_int(1000, 9999);

        $verification = PhoneVerification::query()->create([
            'phone' => $phone,
            'code' => $code,
            'expires_at' => now()->addMinutes(10),
            'verified_at' => null,
        ]);

        $delivery = $this->deliverOtp($phone, $code);

        $verification->update([
            'delivery_channel' => $delivery['channel'],
            'delivery_status' => $delivery['status'],
            'delivery_provider_message_id' => $delivery['providerMessageId'] ?: null,
            'delivery_error' => $delivery['error'],
            'delivered_at' => $delivery['sent'] ? now() : null,
        ]);

        $payload = [
            'message' => 'Verification code generated',
            'phone' => $phone,
            'delivery_channel' => $delivery['channel'],
            'delivery_status' => $delivery['status'],
            'fallback_used' => $delivery['fallbackUsed'],
        ];

        if (app()->isLocal() || $delivery['channel'] === 'manual') {
            $payload['dev_code'] = $code;
        }

        $this->markRequestCodeSent($request, $phone);

        return response()->json($payload);
    }

    public function verifyCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'code' => ['required', 'string', 'max:10'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $this->ensureVerifyAllowed($phone);

        $verification = PhoneVerification::query()
            ->where('phone', $phone)
            ->where('code', $validated['code'])
            ->whereNull('verified_at')
            ->latest('id')
            ->first();

        if (!$verification) {
            $this->markVerifyFailed($phone);
            $this->apiError(422, 'Неверный код подтверждения.', 'auth.otp.verify.invalid_code');
        }
        if ($verification->expires_at->isPast()) {
            $this->apiError(422, 'Срок действия кода истек.', 'auth.otp.verify.expired');
        }

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
        $this->clearVerifyFailures($phone);

        return response()->json([
            'message' => 'Authenticated',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'role' => $user->role,
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'phone_verified_at' => $user->phone_verified_at?->toIso8601String(),
                'role' => $user->role,
            ],
        ]);
    }

    protected function normalizePhone(string $phone): string
    {
        $normalized = preg_replace('/\D+/', '', $phone) ?? '';
        return $normalized;
    }

    protected function ensureRequestCodeAllowed(Request $request, string $phone): void
    {
        $ip = $request->ip() ?: 'unknown';

        $cooldownKey = "auth:otp:cooldown:phone:{$phone}";
        $cooldownSeconds = (int) env('AUTH_OTP_RESEND_COOLDOWN_SECONDS', 60);
        if (Cache::has($cooldownKey)) {
            $this->apiError(429, "Подождите {$cooldownSeconds} сек перед повторной отправкой кода.", 'auth.otp.request.cooldown');
        }

        $phoneLimit15m = (int) env('AUTH_OTP_PHONE_LIMIT_15M', 3);
        $phoneCount15m = (int) Cache::get("auth:otp:req:phone:15m:{$phone}", 0);
        if ($phoneCount15m >= $phoneLimit15m) {
            $this->apiError(429, 'Превышен лимит запросов кода для номера. Попробуйте позже.', 'auth.otp.request.phone_limit_15m');
        }

        $phoneLimitDay = (int) env('AUTH_OTP_PHONE_LIMIT_DAY', 8);
        $phoneCountDay = (int) Cache::get("auth:otp:req:phone:day:{$phone}", 0);
        if ($phoneCountDay >= $phoneLimitDay) {
            $this->apiError(429, 'Суточный лимит запросов кода для номера исчерпан.', 'auth.otp.request.phone_limit_day');
        }

        $ipLimit15m = (int) env('AUTH_OTP_IP_LIMIT_15M', 10);
        $ipCount15m = (int) Cache::get("auth:otp:req:ip:15m:{$ip}", 0);
        if ($ipCount15m >= $ipLimit15m) {
            $this->apiError(429, 'Превышен лимит запросов кода с вашего IP.', 'auth.otp.request.ip_limit_15m');
        }

        $ipPhoneLimit15m = (int) env('AUTH_OTP_IP_PHONE_LIMIT_15M', 3);
        $ipPhoneCount15m = (int) Cache::get("auth:otp:req:ip_phone:15m:{$ip}:{$phone}", 0);
        if ($ipPhoneCount15m >= $ipPhoneLimit15m) {
            $this->apiError(429, 'Слишком много попыток для номера с этого IP.', 'auth.otp.request.ip_phone_limit_15m');
        }

        if ($this->isCaptchaRequired($ip, $phone)) {
            $captchaToken = (string) $request->input('captcha_token', '');
            if ($captchaToken === '') {
                $this->apiError(422, 'Требуется проверка reCAPTCHA. Повторите запрос.', 'auth.captcha.required');
            }
            if (!$this->verifyRecaptchaToken($captchaToken, $ip)) {
                $this->apiError(422, 'Не удалось пройти проверку reCAPTCHA.', 'auth.captcha.failed');
            }
        }
    }

    protected function markRequestCodeSent(Request $request, string $phone): void
    {
        $ip = $request->ip() ?: 'unknown';
        $cooldownSeconds = (int) env('AUTH_OTP_RESEND_COOLDOWN_SECONDS', 60);

        $this->incrementWithTtl("auth:otp:req:phone:15m:{$phone}", 900);
        $this->incrementWithTtl("auth:otp:req:phone:day:{$phone}", $this->secondsUntilDayEnd());
        $this->incrementWithTtl("auth:otp:req:ip:15m:{$ip}", 900);
        $this->incrementWithTtl("auth:otp:req:ip_phone:15m:{$ip}:{$phone}", 900);

        Cache::put("auth:otp:cooldown:phone:{$phone}", 1, now()->addSeconds($cooldownSeconds));
    }

    protected function ensureVerifyAllowed(string $phone): void
    {
        $blockedKey = "auth:otp:verify:blocked:{$phone}";
        if (Cache::has($blockedKey)) {
            $this->apiError(429, 'Слишком много неверных попыток. Номер временно заблокирован.', 'auth.otp.verify.blocked');
        }
    }

    protected function markVerifyFailed(string $phone): void
    {
        $maxAttempts = (int) env('AUTH_OTP_VERIFY_MAX_ATTEMPTS', 5);
        $blockSeconds = (int) env('AUTH_OTP_VERIFY_BLOCK_SECONDS', 1800);

        $attempts = $this->incrementWithTtl("auth:otp:verify:fails:{$phone}", 900);
        if ($attempts >= $maxAttempts) {
            Cache::put("auth:otp:verify:blocked:{$phone}", 1, now()->addSeconds($blockSeconds));
            Cache::forget("auth:otp:verify:fails:{$phone}");
        }
    }

    protected function clearVerifyFailures(string $phone): void
    {
        Cache::forget("auth:otp:verify:fails:{$phone}");
        Cache::forget("auth:otp:verify:blocked:{$phone}");
    }

    protected function incrementWithTtl(string $key, int $ttlSeconds): int
    {
        if (!Cache::has($key)) {
            Cache::put($key, 0, now()->addSeconds($ttlSeconds));
        }

        $value = (int) Cache::increment($key);
        return $value;
    }

    protected function secondsUntilDayEnd(): int
    {
        $seconds = now()->diffInSeconds(now()->endOfDay(), false);
        return max(60, (int) $seconds);
    }

    protected function isCaptchaRequired(string $ip, string $phone): bool
    {
        if (!(bool) env('AUTH_OTP_CAPTCHA_ENABLED', false)) {
            return false;
        }

        $ipTrigger = (int) env('AUTH_OTP_CAPTCHA_TRIGGER_IP_ATTEMPTS', 3);
        $ipPhoneTrigger = (int) env('AUTH_OTP_CAPTCHA_TRIGGER_IP_PHONE_ATTEMPTS', 2);

        $ipCount15m = (int) Cache::get("auth:otp:req:ip:15m:{$ip}", 0);
        $ipPhoneCount15m = (int) Cache::get("auth:otp:req:ip_phone:15m:{$ip}:{$phone}", 0);

        return $ipCount15m >= $ipTrigger || $ipPhoneCount15m >= $ipPhoneTrigger;
    }

    protected function verifyRecaptchaToken(string $token, string $ip): bool
    {
        $secret = (string) env('RECAPTCHA_SECRET_KEY', '');
        if ($secret === '') {
            return false;
        }

        try {
            $response = Http::asForm()
                ->timeout(5)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $ip,
                ]);

            if (!$response->ok()) {
                return false;
            }

            $payload = $response->json();
            if (!is_array($payload)) {
                return false;
            }

            if (!(bool) ($payload['success'] ?? false)) {
                return false;
            }

            $score = (float) ($payload['score'] ?? 0);
            $minScore = (float) env('RECAPTCHA_MIN_SCORE', 0.5);

            return $score >= $minScore;
        } catch (\Throwable) {
            return false;
        }
    }

    protected function apiError(int $status, string $message, string $code): never
    {
        throw new HttpResponseException(response()->json([
            'message' => $message,
            'code' => $code,
        ], $status));
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

    /**
     * @return array{
     *   sent: bool,
     *   channel: string,
     *   status: string,
     *   providerMessageId: ?string,
     *   error: ?string,
     *   fallbackUsed: bool
     * }
     */
    protected function deliverOtp(string $phone, string $code): array
    {
        $serviceClass = 'Modules\\Communications\\Services\\OtpDeliveryService';
        if (class_exists($serviceClass)) {
            try {
                $service = new $serviceClass();
                $result = $service->sendCode($phone, $code);

                return [
                    'sent' => (bool) ($result->sent ?? false),
                    'channel' => (string) ($result->channel ?? 'manual'),
                    'status' => (string) ($result->status ?? 'manual_fallback'),
                    'providerMessageId' => $result->providerMessageId ?? null,
                    'error' => $result->error ?? null,
                    'fallbackUsed' => (bool) ($result->fallbackUsed ?? true),
                ];
            } catch (\Throwable) {
                // If module class exists but cannot be instantiated in current runtime,
                // keep auth flow alive via manual fallback.
            }
        }

        return [
            'sent' => true,
            'channel' => 'manual',
            'status' => 'manual_fallback',
            'providerMessageId' => null,
            'error' => 'Communications module is not loaded',
            'fallbackUsed' => true,
        ];
    }
}
