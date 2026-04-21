<?php

namespace Modules\Wishlist\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class WishlistServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Wishlist';

    protected string $nameLower = 'wishlist';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
