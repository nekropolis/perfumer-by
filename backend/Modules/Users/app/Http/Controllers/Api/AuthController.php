<?php

namespace Modules\Users\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\UserDiscountCard;
use Modules\Users\Models\PhoneVerification;
use Modules\Checkout\Support\OrderAccountScope;
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

        OrderAccountScope::linkOrdersForUser($user);

        $verifiedCards = $user->discountCards()
            ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
            ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
            ->orderByDesc('discount_percent')
            ->get(['discount_cards.id', 'card_number', 'discount_percent', 'status']);

        $cardsPayload = $verifiedCards->map(static function ($card) {
            $pct = DiscountCard::effectiveDiscountPercent((float) $card->discount_percent);

            return [
                'id' => (int) $card->id,
                'number' => (string) $card->card_number,
                'discount_percent' => (string) $pct,
                'is_active' => $card->status === DiscountCard::STATUS_ACTIVE,
            ];
        })->values()->all();

        return response()->json([
            'data' => $this->toProfilePayload($user, $cardsPayload),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'patronymic' => ['nullable', 'string', 'max:255'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'birth_date' => ['nullable', 'date', 'before_or_equal:today'],
        ]);

        $firstName = array_key_exists('first_name', $validated)
            ? trim((string) ($validated['first_name'] ?? ''))
            : trim((string) ($user->first_name ?? ''));
        $lastName = array_key_exists('last_name', $validated)
            ? trim((string) ($validated['last_name'] ?? ''))
            : trim((string) ($user->last_name ?? ''));
        $patronymic = array_key_exists('patronymic', $validated)
            ? trim((string) ($validated['patronymic'] ?? ''))
            : trim((string) ($user->patronymic ?? ''));

        $updates = [
            'first_name' => $firstName !== '' ? $firstName : null,
            'last_name' => $lastName !== '' ? $lastName : null,
            'patronymic' => $patronymic !== '' ? $patronymic : null,
        ];

        if (array_key_exists('birth_date', $validated)) {
            $updates['birth_date'] = $validated['birth_date'] ?: null;
        }

        $displayName = trim(implode(' ', array_filter([$firstName, $patronymic, $lastName])));
        if ($displayName !== '') {
            $updates['name'] = $displayName;
        }

        if (array_key_exists('email', $validated)) {
            $email = trim((string) ($validated['email'] ?? ''));
            if ($email === '') {
                if ($user->isPlaceholderEmail() || !$user->phone) {
                    $updates['email'] = $user->email;
                } else {
                    $updates['email'] = $this->normalizePhone((string) $user->phone).'@phone.local';
                }
            } else {
                $updates['email'] = mb_strtolower($email, 'UTF-8');
            }
        }

        $user->update($updates);
        $user->refresh();

        $verifiedCards = $user->discountCards()
            ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
            ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
            ->orderByDesc('discount_percent')
            ->get(['discount_cards.id', 'card_number', 'discount_percent', 'status']);

        $cardsPayload = $verifiedCards->map(static function ($card) {
            $pct = DiscountCard::effectiveDiscountPercent((float) $card->discount_percent);

            return [
                'id' => (int) $card->id,
                'number' => (string) $card->card_number,
                'discount_percent' => (string) $pct,
                'is_active' => $card->status === DiscountCard::STATUS_ACTIVE,
            ];
        })->values()->all();

        return response()->json([
            'data' => $this->toProfilePayload($user, $cardsPayload),
            'message' => 'Профиль обновлён',
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $cardsPayload
     * @return array<string, mixed>
     */
    protected function toProfilePayload(User $user, array $cardsPayload): array
    {
        return [
            'id' => $user->id,
            'name' => $user->displayName(),
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'patronymic' => $user->patronymic,
            'email' => $user->profileEmail(),
            'birth_date' => $user->birth_date?->format('Y-m-d'),
            'phone' => $user->phone,
            'phone_verified_at' => $user->phone_verified_at?->toIso8601String(),
            'role' => $user->role,
            'discount_cards' => $cardsPayload,
        ];
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'regex:'.Phone::REGEX],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
            'captcha_token' => ['nullable', 'string', 'max:4096'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $name = trim((string) $validated['name']);

        if (User::query()->where('phone', $phone)->exists()) {
            $this->apiError(409, 'Пользователь с этим номером уже зарегистрирован. Войдите в аккаунт.', 'auth.register.user_exists');
        }

        $pending = PhoneVerification::query()
            ->where('phone', $phone)
            ->where('purpose', PhoneVerification::PURPOSE_REGISTER)
            ->whereNull('verified_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if ($pending instanceof PhoneVerification) {
            $pending->update([
                'meta' => json_encode([
                    'name' => $name,
                    'password' => (string) $validated['password'],
                ], JSON_UNESCAPED_UNICODE),
            ]);

            $payload = [
                'message' => 'Код уже отправлен. Проверьте SMS или подождите перед повторной отправкой.',
                'phone' => $phone,
            ];

            if (app()->isLocal()) {
                $payload['dev_code'] = (string) $pending->code;
            }

            return response()->json($payload);
        }

        $this->ensureRequestCodeAllowed($request, $phone);
        $code = (string) random_int(1000, 9999);

        $verification = PhoneVerification::query()->create([
            'phone' => $phone,
            'purpose' => PhoneVerification::PURPOSE_REGISTER,
            'meta' => json_encode([
                'name' => $name,
                'password' => (string) $validated['password'],
            ], JSON_UNESCAPED_UNICODE),
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

        $this->markRequestCodeSent($request, $phone);

        $payload = [
            'message' => 'Код подтверждения отправлен',
            'phone' => $phone,
        ];

        if (app()->isLocal() || $delivery['channel'] === 'manual') {
            $payload['dev_code'] = $code;
        }

        return response()->json($payload);
    }

    public function registerVerify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'code' => ['required', 'string', 'max:10'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $this->ensureVerifyAllowed($phone);

        $verification = $this->findActiveVerification($phone, $validated['code'], PhoneVerification::PURPOSE_REGISTER);
        if ($verification === null) {
            $this->markVerifyFailed($phone);
            $this->apiError(422, 'Неверный код подтверждения.', 'auth.otp.verify.invalid_code');
        }

        if ($verification->expires_at->isPast()) {
            $this->apiError(422, 'Срок действия кода истек.', 'auth.otp.verify.expired');
        }

        if (User::query()->where('phone', $phone)->exists()) {
            $this->apiError(409, 'Пользователь с этим номером уже зарегистрирован. Войдите в аккаунт.', 'auth.register.user_exists');
        }

        $meta = $this->decodeVerificationMeta($verification);
        $name = trim((string) ($meta['name'] ?? ''));
        $password = (string) ($meta['password'] ?? '');

        if ($name === '' || $password === '') {
            $this->apiError(422, 'Данные регистрации устарели. Запросите код повторно.', 'auth.register.stale');
        }

        $verification->update(['verified_at' => now()]);

        $user = User::query()->create([
            'first_name' => $name,
            'name' => $name,
            'phone' => $phone,
            'email' => $phone.'@phone.local',
            'password' => $password,
            'phone_verified_at' => now(),
            'role' => 'customer',
        ]);

        $this->attachOrdersToUser($user, $phone);
        $this->clearVerifyFailures($phone);

        return response()->json($this->authSuccessPayload($user));
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'regex:'.Phone::REGEX],
            'password' => ['required', 'string', 'max:255'],
            'captcha_token' => ['nullable', 'string', 'max:4096'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $ip = $request->ip() ?: 'unknown';

        $this->ensureLoginCaptchaIfNeeded($request, $ip, $phone);

        $user = User::query()->where('phone', $phone)->first();

        if (! $user instanceof User || ! Hash::check((string) $validated['password'], (string) $user->password)) {
            $this->markLoginFailed($ip, $phone);
            $this->apiError(422, 'Неверный телефон или пароль.', 'auth.login.invalid_credentials');
        }

        $this->clearLoginFailures($ip, $phone);

        return response()->json($this->authSuccessPayload($user));
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'regex:'.Phone::REGEX],
            'captcha_token' => ['nullable', 'string', 'max:4096'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $user = User::query()->where('phone', $phone)->first();

        if (! $user instanceof User) {
            $this->apiError(404, 'Пользователь с этим номером не найден.', 'auth.forgot.user_not_found');
        }

        $this->ensureRequestCodeAllowed($request, $phone);
        $newPassword = $this->generateTemporaryPassword();
        $user->update(['password' => Hash::make($newPassword)]);

        $text = "Ваш новый пароль: {$newPassword}. Смените его в личном кабинете.";
        $delivery = $this->deliverText($phone, $text);
        $this->markRequestCodeSent($request, $phone);

        $payload = [
            'message' => 'Новый пароль отправлен по SMS',
            'phone' => $phone,
        ];

        if (app()->isLocal() || ($delivery['channel'] ?? '') === 'manual') {
            $payload['dev_password'] = $newPassword;
        }

        return response()->json($payload);
    }

    public function passwordChangeRequest(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        $phone = $this->normalizePhone((string) ($user->phone ?? ''));
        if ($phone === '') {
            $this->apiError(422, 'У аккаунта не указан телефон.', 'auth.password_change.no_phone');
        }

        $this->ensureRequestCodeAllowed($request, $phone);
        $code = (string) random_int(1000, 9999);

        $verification = PhoneVerification::query()->create([
            'phone' => $phone,
            'purpose' => PhoneVerification::PURPOSE_PASSWORD_RESET,
            'meta' => json_encode([
                'user_id' => (int) $user->id,
                'password' => (string) $validated['password'],
            ], JSON_UNESCAPED_UNICODE),
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

        $this->markRequestCodeSent($request, $phone);

        $payload = [
            'message' => 'Код подтверждения отправлен',
            'phone' => $phone,
        ];

        if (app()->isLocal() || $delivery['channel'] === 'manual') {
            $payload['dev_code'] = $code;
        }

        return response()->json($payload);
    }

    public function passwordChangeVerify(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:10'],
        ]);

        $phone = $this->normalizePhone((string) ($user->phone ?? ''));
        if ($phone === '') {
            $this->apiError(422, 'У аккаунта не указан телефон.', 'auth.password_change.no_phone');
        }

        $this->ensureVerifyAllowed($phone);

        $verification = $this->findActiveVerification($phone, $validated['code'], PhoneVerification::PURPOSE_PASSWORD_RESET);
        if ($verification === null) {
            $this->markVerifyFailed($phone);
            $this->apiError(422, 'Неверный код подтверждения.', 'auth.otp.verify.invalid_code');
        }

        if ($verification->expires_at->isPast()) {
            $this->apiError(422, 'Срок действия кода истек.', 'auth.otp.verify.expired');
        }

        $meta = $this->decodeVerificationMeta($verification);
        if ((int) ($meta['user_id'] ?? 0) !== (int) $user->id) {
            $this->apiError(422, 'Неверный код подтверждения.', 'auth.otp.verify.invalid_code');
        }

        $password = (string) ($meta['password'] ?? '');
        if ($password === '') {
            $this->apiError(422, 'Запрос на смену пароля устарел. Повторите попытку.', 'auth.password_change.stale');
        }

        $verification->update(['verified_at' => now()]);
        $user->update(['password' => $password]);
        $this->clearVerifyFailures($phone);

        return response()->json([
            'message' => 'Пароль изменён',
        ]);
    }

    /**
     * @return array{message: string, token: string, user: array<string, mixed>}
     */
    protected function authSuccessPayload(User $user): array
    {
        OrderAccountScope::linkOrdersForUser($user);

        $token = $user->createToken('frontend')->plainTextToken;

        return [
            'message' => 'Authenticated',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->displayName(),
                'phone' => $user->phone,
                'role' => $user->role,
            ],
        ];
    }

    protected function generateTemporaryPassword(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ';
        $length = 10;
        $password = '';

        for ($i = 0; $i < $length; $i++) {
            $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $password;
    }

    protected function findActiveVerification(string $phone, string $code, string $purpose): ?PhoneVerification
    {
        return PhoneVerification::query()
            ->where('phone', $phone)
            ->where('code', $code)
            ->where('purpose', $purpose)
            ->whereNull('verified_at')
            ->latest('id')
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    protected function decodeVerificationMeta(PhoneVerification $verification): array
    {
        if (! is_string($verification->meta) || trim($verification->meta) === '') {
            return [];
        }

        $decoded = json_decode($verification->meta, true);

        return is_array($decoded) ? $decoded : [];
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

        $captchaVerified = $this->verifyCaptchaFromRequest($request, $ip);

        if (! $captchaVerified) {
            $phoneLimit15m = (int) env('AUTH_OTP_PHONE_LIMIT_15M', 3);
            $phoneCount15m = (int) Cache::get("auth:otp:req:phone:15m:{$phone}", 0);
            $captchaEnabled = (bool) env('AUTH_OTP_CAPTCHA_ENABLED', false);
            if (! $captchaEnabled && $phoneLimit15m > 0 && $phoneCount15m >= $phoneLimit15m) {
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
                $this->apiError(422, 'Требуется проверка reCAPTCHA. Повторите запрос.', 'auth.captcha.required');
            }
        }
    }

    protected function ensureLoginCaptchaIfNeeded(Request $request, string $ip, string $phone): void
    {
        $always = (bool) env('AUTH_LOGIN_CAPTCHA_ENABLED', env('AUTH_OTP_CAPTCHA_ENABLED', false));
        $failures = (int) Cache::get("auth:login:fails:{$ip}:{$phone}", 0);
        $triggerFailures = (int) env('AUTH_LOGIN_CAPTCHA_TRIGGER_FAILURES', 2);

        if (! $always && $failures < $triggerFailures) {
            return;
        }

        $captchaToken = trim((string) $request->input('captcha_token', ''));
        if ($captchaToken === '' || ! $this->verifyRecaptchaToken($captchaToken, $ip)) {
            $this->apiError(
                422,
                $captchaToken === '' ? 'Требуется проверка reCAPTCHA. Повторите запрос.' : 'Не удалось пройти проверку reCAPTCHA.',
                $captchaToken === '' ? 'auth.captcha.required' : 'auth.captcha.failed'
            );
        }
    }

    protected function markLoginFailed(string $ip, string $phone): void
    {
        $this->incrementWithTtl("auth:login:fails:{$ip}:{$phone}", 900);
    }

    protected function clearLoginFailures(string $ip, string $phone): void
    {
        Cache::forget("auth:login:fails:{$ip}:{$phone}");
    }

    protected function verifyCaptchaFromRequest(Request $request, string $ip): bool
    {
        $captchaToken = trim((string) $request->input('captcha_token', ''));
        if ($captchaToken === '') {
            return false;
        }

        return $this->verifyRecaptchaToken($captchaToken, $ip);
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
        if ($phone === '') {
            return;
        }

        OrderAccountScope::linkOrdersForUser($user);
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
        return $this->deliverText($phone, "Код подтверждения: {$code}. Никому не сообщайте этот код.");
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
    protected function deliverText(string $phone, string $text): array
    {
        $serviceClass = 'Modules\\Communications\\Services\\OtpDeliveryService';
        if (class_exists($serviceClass)) {
            try {
                $service = new $serviceClass();
                $result = $service->sendText($phone, $text);

                return [
                    'sent' => (bool) ($result->sent ?? false),
                    'channel' => (string) ($result->channel ?? 'manual'),
                    'status' => (string) ($result->status ?? 'manual_fallback'),
                    'providerMessageId' => $result->providerMessageId ?? null,
                    'error' => $result->error ?? null,
                    'fallbackUsed' => (bool) ($result->fallbackUsed ?? true),
                ];
            } catch (\Throwable) {
                // keep auth flow alive via manual fallback
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
