<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Users\Http\Controllers\Api\AuthController;
use Modules\Users\Models\PhoneVerification;
use Modules\Users\Models\User;
use Tests\TestCase;

class AuthHardeningTest extends TestCase
{
    protected function setUp(): void
    {
        require_once dirname(__DIR__, 2).'/Modules/Users/app/Http/Controllers/Api/AuthController.php';

        parent::setUp();

        $this->skipUnlessSqliteDriver();

        Schema::create('phone_verifications', function (Blueprint $table): void {
            $table->id();
            $table->string('phone', 32)->index();
            $table->string('purpose', 32)->default(PhoneVerification::PURPOSE_LEGACY);
            $table->string('code', 10);
            $table->text('meta')->nullable();
            $table->string('delivery_channel', 16)->nullable();
            $table->string('delivery_status', 32)->nullable();
            $table->string('delivery_provider_message_id', 191)->nullable();
            $table->text('delivery_error')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table): void {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        app()->instance('env', 'testing');
        config()->set('app.env', 'testing');
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('phone_verifications');

        parent::tearDown();
    }

    public function test_production_never_exposes_mock_otp_credentials(): void
    {
        app()->instance('env', 'production');
        config()->set([
            'app.env' => 'production',
            'communications.viber.driver' => 'mock',
            'communications.viber.mock_registration_mode' => 'all',
            'communications.sms.driver' => 'mock',
            'auth.otp.captcha_enabled' => false,
        ]);
        Log::spy();

        $response = $this->postJson('/api/auth/request-code', [
            'phone' => '+375291234567',
        ]);

        $response->assertOk();
        $this->assertArrayNotHasKey('dev_code', $response->json());

        $code = (string) PhoneVerification::query()->value('code');
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);

        Log::shouldHaveReceived('warning')
            ->once()
            ->with(
                'Production uses mock OTP delivery drivers; dev credentials remain hidden.',
                [
                    'sms_driver' => 'mock',
                    'viber_driver' => 'mock',
                ],
            );
    }

    public function test_four_digit_otp_is_rejected(): void
    {
        $this->postJson('/api/auth/verify-code', [
            'phone' => '+375291234567',
            'code' => '1234',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    public function test_frontend_login_tokens_expire_but_device_tokens_do_not(): void
    {
        config()->set('auth.frontend_token_ttl_minutes', 43200);

        $user = new User();
        $user->forceFill(['id' => 1]);
        $user->exists = true;

        $controller = new class extends AuthController
        {
            /**
             * @return array{message: string, token: string, user: array<string, mixed>}
             */
            public function frontendLoginPayloadForTest(User $user): array
            {
                return $this->authSuccessPayload($user);
            }
        };

        $payload = $controller->frontendLoginPayloadForTest($user);
        $this->assertNotEmpty($payload['token']);

        $frontendToken = PersonalAccessToken::query()
            ->where('name', 'frontend')
            ->firstOrFail();

        $this->assertNotNull($frontendToken->expires_at);
        $this->assertEqualsWithDelta(
            now()->addMinutes(43200)->timestamp,
            $frontendToken->expires_at->timestamp,
            5,
        );

        $user->createToken('incoming-call-device:test', ['incoming-call:send-to-crm']);

        $deviceToken = PersonalAccessToken::query()
            ->where('name', 'incoming-call-device:test')
            ->firstOrFail();

        $this->assertNull($deviceToken->expires_at);

        config()->set('auth.frontend_token_ttl_minutes', 0);
        $controller->frontendLoginPayloadForTest($user);

        $frontendTokenWithoutTtl = PersonalAccessToken::query()
            ->where('name', 'frontend')
            ->latest('id')
            ->firstOrFail();

        $this->assertNull($frontendTokenWithoutTtl->expires_at);
    }
}
