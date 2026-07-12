<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Facades\Cache;
use Modules\Warehouse\Models\Warehouse;

final class CatalogListingWarehouseIds
{
    /**
     * @return list<int>
     */
    public static function resolve(): array
    {
        /** @var list<int> $ids */
        $ids = Cache::remember('catalog:warehouse:listing-ids', 3600, static function (): array {
            return Warehouse::query()
                ->whereIn('code', [Warehouse::CODE_MAIN, Warehouse::CODE_SUPPLIER])
                ->pluck('id')
                ->map(static fn ($id): int => (int) $id)
                ->filter(static fn (int $id): bool => $id > 0)
                ->values()
                ->all();
        });

        return $ids;
    }
}
