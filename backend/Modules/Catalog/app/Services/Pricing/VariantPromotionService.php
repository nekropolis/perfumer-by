<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

final class VariantPromotionService
{
    public function hasMainWarehouseAvailableStock(int $variantId, ?int $mainWarehouseId = null): bool
    {
        $mainWarehouseId ??= (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        if ($mainWarehouseId <= 0) {
            return false;
        }

        // Акция живёт, пока есть остаток на основном складе (как в refresh склада).
        // Не смотрим available (stock−reserved): полный резерв не должен снимать флаг.
        return WarehouseVariantStock::query()
            ->where('warehouse_id', $mainWarehouseId)
            ->where('variant_id', $variantId)
            ->where('stock', '>', 0)
            ->exists();
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, true>
     */
    public function mainWarehouseStockMap(array $variantIds, ?int $mainWarehouseId = null): array
    {
        $mainWarehouseId ??= (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        if ($mainWarehouseId <= 0 || $variantIds === []) {
            return [];
        }

        $variantIds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $id): int => (int) $id, $variantIds),
            static fn (int $id): bool => $id > 0,
        )));

        $rows = WarehouseVariantStock::query()
            ->where('warehouse_id', $mainWarehouseId)
            ->whereIn('variant_id', $variantIds)
            ->where('stock', '>', 0)
            ->pluck('variant_id');

        $map = [];
        foreach ($rows as $variantId) {
            $map[(int) $variantId] = true;
        }

        return $map;
    }

    public function clearPromotionIfMainWarehouseEmpty(int $variantId, ?int $mainWarehouseId = null): bool
    {
        $variant = ProductVariantLink::query()->find($variantId);
        if (!$variant || !(bool) $variant->is_promotion) {
            return false;
        }

        if ($this->hasMainWarehouseAvailableStock($variantId, $mainWarehouseId)) {
            return false;
        }

        $variant->update(['is_promotion' => false]);

        return true;
    }

    /**
     * @param  list<int>  $variantIds
     */
    public function clearPromotionForVariantsWithoutMainStock(array $variantIds, ?int $mainWarehouseId = null): int
    {
        $mainWarehouseId ??= (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        if ($mainWarehouseId <= 0 || $variantIds === []) {
            return 0;
        }

        $stockMap = $this->mainWarehouseStockMap($variantIds, $mainWarehouseId);
        $toClear = array_values(array_filter(
            $variantIds,
            static fn (int $id): bool => !isset($stockMap[$id]),
        ));

        if ($toClear === []) {
            return 0;
        }

        $cleared = ProductVariantLink::query()
            ->whereIn('id', $toClear)
            ->where('is_promotion', true)
            ->update(['is_promotion' => false]);

        if ($cleared > 0) {
            app(CatalogApiCacheService::class)->requestInvalidation();
        }

        return $cleared;
    }
}
