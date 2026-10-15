<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('reviews-read', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });

        RateLimiter::for('reviews-submit', function (Request $request) {
            return Limit::perMinutes(15, 5)->by($request->ip());
        });

        RateLimiter::for('checkout-submit', function (Request $request) {
            // SSR Next.js ходит в API с loopback.
            if (in_array($request->ip(), ['127.0.0.1', '::1'], true)) {
                return Limit::none();
            }

            return Limit::perMinutes(10, 10)
                ->by($request->ip())
                ->response(fn (Request $request, array $headers) => response()->json([
                    'message' => 'Слишком много попыток оформить заказ. Повторите позже.',
                    'code' => 'TOO_MANY_CHECKOUT_ATTEMPTS',
                ], 429, $headers));
        });
    }
}
