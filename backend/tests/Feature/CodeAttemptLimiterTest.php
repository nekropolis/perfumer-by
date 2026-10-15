<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Users\Models\Client;
use Tests\TestCase;

class CodeAttemptLimiterTest extends TestCase
{
    private const IP_A = '203.0.113.10';

    private const IP_B = '203.0.113.20';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();
        $this->createMinimalSchema();
        Cache::forever('settings:shop-settings:all-map', []);
        Queue::fake();
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            foreach ([
                'gift_certificate_transactions',
                'gift_certificates',
                'client_discount_cards',
                'discount_cards',
                'cart_gift_certificate_items',
                'cart_items',
                'carts',
                'clients',
            ] as $table) {
                Schema::dropIfExists($table);
            }
        }

        parent::tearDown();
    }

    public function test_lock_escalates_from_minute_to_half_hour_to_day_with_telegram(): void
    {
        $this->failCardTimes(self::IP_A, 3);
        $locked = $this->applyCard(self::IP_A, 'WRONG')->assertStatus(429)
            ->assertJsonPath('code', 'TOO_MANY_CODE_ATTEMPTS')
            ->assertJsonPath('message', 'Слишком много неверных попыток. Повторите через 1 мин.');
        $this->assertRetryAfterAbout($locked, 60);
        Queue::assertNotPushed(SendTelegramMessageJob::class);

        $this->travel(61)->seconds();
        $this->failCardTimes(self::IP_A, 3);
        $this->assertRetryAfterAbout($this->applyCard(self::IP_A, 'WRONG')->assertStatus(429), 1800);
        Queue::assertNotPushed(SendTelegramMessageJob::class);

        $this->travel(1801)->seconds();
        $this->failCardTimes(self::IP_A, 3);
        $this->assertRetryAfterAbout($this->applyCard(self::IP_A, 'WRONG')->assertStatus(429), 86400);
        Queue::assertPushed(SendTelegramMessageJob::class, 1);
        Queue::assertPushed(SendTelegramMessageJob::class, fn (SendTelegramMessageJob $job): bool => str_contains($job->text, self::IP_A));
    }

    public function test_escalation_level_decays_after_a_day(): void
    {
        $this->failCardTimes(self::IP_A, 3);
        $this->travel(61)->seconds();
        $this->failCardTimes(self::IP_A, 3);

        $this->travel(86401)->seconds();
        $this->failCardTimes(self::IP_A, 3);
        $this->assertRetryAfterAbout($this->applyCard(self::IP_A, 'WRONG')->assertStatus(429), 60);
    }

    public function test_success_does_not_reset_failures_or_level(): void
    {
        $this->seedCard('1111');

        $this->failCardTimes(self::IP_A, 2);
        $this->applyCard(self::IP_A, '1111')->assertOk();
        $this->applyCard(self::IP_A, 'WRONG')->assertStatus(422);
        $this->assertRetryAfterAbout($this->applyCard(self::IP_A, 'WRONG')->assertStatus(429), 60);

        $this->travel(61)->seconds();
        $this->applyCard(self::IP_A, '1111')->assertOk();
        $this->failCardTimes(self::IP_A, 3);
        $this->assertRetryAfterAbout($this->applyCard(self::IP_A, '1111')->assertStatus(429), 1800);
    }

    public function test_counter_is_shared_across_cart_and_account_endpoints_and_follows_client(): void
    {
        $this->seedCard('BLOCKED', DiscountCard::STATUS_BLOCKED);
        $client = $this->seedClient('375290000001');
        $this->actingAs($client, 'sanctum');

        $this->fromIp(self::IP_A)->postJson('/api/cart/gift-certificate/apply', ['code' => 'NOPE'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'GIFT_CERTIFICATE_NOT_FOUND');
        $this->applyCard(self::IP_A, 'BLOCKED')->assertStatus(422)->assertJsonPath('code', 'DISCOUNT_CARD_INACTIVE');
        $this->fromIp(self::IP_A)->postJson('/api/loyalty/cards/attach', ['number' => 'NOPE'])
            ->assertStatus(404);

        $this->fromIp(self::IP_A)->postJson('/api/cart/gift-certificate/apply', ['code' => 'NOPE'])->assertStatus(429);
        $this->fromIp(self::IP_A)->postJson('/api/loyalty/cards/attach', ['number' => 'NOPE'])->assertStatus(429);
        $this->applyCard(self::IP_B, 'NOPE')->assertStatus(429);
    }

    public function test_locked_request_does_not_query_codes(): void
    {
        $this->failCardTimes(self::IP_A, 3);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->applyCard(self::IP_A, 'WRONG')->assertStatus(429);
        $this->fromIp(self::IP_A)->postJson('/api/cart/gift-certificate/apply', ['code' => 'NOPE'])->assertStatus(429);

        $this->assertSame([], DB::getQueryLog());
    }

    public function test_loopback_is_never_locked(): void
    {
        foreach (['127.0.0.1', '::1'] as $ip) {
            for ($i = 0; $i < 10; $i++) {
                $this->applyCard($ip, 'WRONG')->assertStatus(422);
            }
        }
        Queue::assertNotPushed(SendTelegramMessageJob::class);
    }

    public function test_shared_card_applies_for_other_ips_and_clients_when_not_locked(): void
    {
        $this->seedCard('2222');
        $this->failCardTimes(self::IP_A, 3);
        $this->applyCard(self::IP_A, '2222')->assertStatus(429);

        $this->applyCard(self::IP_B, '2222')->assertOk()->assertJsonPath('data.discount_card.number', '2222');

        foreach (['375290000011', '375290000022'] as $phone) {
            $this->actingAs($this->seedClient($phone), 'sanctum');
            $this->applyCard('198.51.100.' . substr($phone, -2), '2222')
                ->assertOk()
                ->assertJsonPath('data.discount_card.number', '2222');
        }
    }

    private function fromIp(string $ip): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip]);
    }

    private function applyCard(string $ip, string $number): TestResponse
    {
        return $this->fromIp($ip)->postJson('/api/cart/discount-card/apply', ['number' => $number]);
    }

    private function failCardTimes(string $ip, int $times): void
    {
        for ($i = 0; $i < $times; $i++) {
            $this->applyCard($ip, 'WRONG-' . $i)->assertStatus(422)->assertJsonPath('code', 'DISCOUNT_CARD_NOT_FOUND');
        }
    }

    private function assertRetryAfterAbout(TestResponse $response, int $seconds): void
    {
        $retryAfter = (int) $response->json('retry_after');
        $this->assertGreaterThanOrEqual($seconds - 5, $retryAfter);
        $this->assertLessThanOrEqual($seconds, $retryAfter);
        $this->assertSame((string) $retryAfter, $response->headers->get('Retry-After'));
    }

    private function seedCard(string $number, string $status = DiscountCard::STATUS_ACTIVE): DiscountCard
    {
        return DiscountCard::query()->create([
            'card_number' => $number,
            'discount_percent' => '5.00',
            'status' => $status,
        ]);
    }

    private function seedClient(string $phone): Client
    {
        return Client::query()->create(['name' => 'Тест', 'phone' => $phone]);
    }

    private function createMinimalSchema(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('patronymic')->nullable();
            $table->date('birth_date')->nullable();
            $table->string('email')->nullable();
            $table->string('password')->nullable();
            $table->string('phone')->nullable();
            $table->string('additional_phone')->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('carts', function (Blueprint $table) {
            $table->id();
            $table->string('token')->unique();
            $table->unsignedBigInteger('client_id')->nullable();
            $table->string('gift_certificate_code')->nullable();
            $table->string('discount_card_number')->nullable();
            $table->boolean('discount_card_session_only')->default(false);
            $table->timestamps();
        });

        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('cart_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->integer('qty')->default(1);
            $table->boolean('waiting_discount')->default(false);
            $table->string('availability_source')->nullable();
            $table->timestamps();
        });

        Schema::create('cart_gift_certificate_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('cart_id');
            $table->unsignedBigInteger('template_id')->nullable();
            $table->integer('qty')->default(1);
            $table->timestamps();
        });

        Schema::create('discount_cards', function (Blueprint $table) {
            $table->id();
            $table->string('card_number')->unique();
            $table->decimal('discount_percent', 5, 2)->default(0);
            $table->boolean('is_manual_discount')->default(false);
            $table->string('status')->default('active');
            $table->timestamp('issued_at')->nullable();
            $table->string('owner_name')->nullable();
            $table->string('phone')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('spent_total', 12, 2)->default(0);
            $table->timestamp('last_order_completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('client_discount_cards', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->unsignedBigInteger('discount_card_id');
            $table->timestamp('linked_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->string('source')->nullable();
            $table->string('link_status')->nullable();
            $table->timestamps();
        });

        Schema::create('gift_certificates', function (Blueprint $table) {
            $table->id();
            $table->string('code')->nullable();
            $table->decimal('initial_amount', 12, 2)->default(0);
            $table->decimal('balance_amount', 12, 2)->default(0);
            $table->decimal('reserved_amount', 12, 2)->default(0);
            $table->string('status')->default('active');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('gift_certificate_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('gift_certificate_id');
            $table->string('cart_token')->nullable();
            $table->string('type');
            $table->decimal('amount', 12, 2)->default(0);
            $table->timestamps();
        });
    }
}
