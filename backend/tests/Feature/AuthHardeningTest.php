<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Modules\Users\Models\PhoneVerification;
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
    }

    protected function tearDown(): void
    {
        app()->instance('env', 'testing');
        config()->set('app.env', 'testing');
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
}
