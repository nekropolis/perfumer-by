<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CheckoutSubmitGuardTest extends TestCase
{
    private const CART_TOKEN = 'cart-token-checkout-guard';

    public function test_checkout_is_throttled_per_ip(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.50']);

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/checkout', [])->assertStatus(422);
        }

        $this->postJson('/api/checkout', [])
            ->assertStatus(429)
            ->assertHeader('Retry-After')
            ->assertJsonPath('code', 'TOO_MANY_CHECKOUT_ATTEMPTS')
            ->assertJsonPath('message', 'Слишком много попыток оформить заказ. Повторите позже.');

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.51'])
            ->postJson('/api/checkout', [])
            ->assertStatus(422);
    }

    public function test_checkout_from_loopback_is_not_throttled(): void
    {
        for ($i = 0; $i < 15; $i++) {
            $this->postJson('/api/checkout', [])->assertStatus(422);
        }
    }

    public function test_concurrent_checkout_of_same_cart_returns_conflict(): void
    {
        $lock = Cache::lock('checkout:cart:' . sha1(self::CART_TOKEN), 60);
        $this->assertTrue($lock->get());

        $this->withHeader('X-Cart-Token', self::CART_TOKEN)
            ->postJson('/api/checkout', [])
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Заказ уже оформляется',
                'code' => 'CHECKOUT_IN_PROGRESS',
            ]);

        $this->withHeader('X-Cart-Token', 'another-cart-token')
            ->postJson('/api/checkout', [])
            ->assertStatus(422);

        $lock->release();

        $this->withHeader('X-Cart-Token', self::CART_TOKEN)
            ->postJson('/api/checkout', [])
            ->assertStatus(422);
    }

    public function test_checkout_releases_cart_lock_after_request(): void
    {
        $this->withHeader('X-Cart-Token', self::CART_TOKEN)
            ->postJson('/api/checkout', [])
            ->assertStatus(422);

        $this->assertTrue(Cache::lock('checkout:cart:' . sha1(self::CART_TOKEN), 60)->get());
    }
}
