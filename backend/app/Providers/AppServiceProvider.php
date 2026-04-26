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
    }
}
