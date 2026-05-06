<?php

namespace Modules\ImportExport\Support;

use Illuminate\Support\Facades\DB;

class LegacyProductDetector
{
    /** @var array<int, true> */
    private array $cache = [];

    /**
     * @param  list<int>  $productIds
     */
    public function preload(array $productIds): void
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $productIds))));
        if ($ids === []) {
            return;
        }

        $fromMap = DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->whereNotNull('product_id')
            ->whereIn('product_id', $ids)
            ->pluck('product_id')
            ->all();

        $fromUnmatched = DB::table('legacy_unmatched_products')
            ->where('status', 'linked')
            ->whereNotNull('linked_product_id')
            ->whereIn('linked_product_id', $ids)
            ->pluck('linked_product_id')
            ->all();

        foreach (array_merge($fromMap, $fromUnmatched) as $pid) {
            $this->cache[(int) $pid] = true;
        }
    }

    public function isLegacy(int $productId): bool
    {
        if (isset($this->cache[$productId])) {
            return true;
        }

        $matched = DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->where('product_id', $productId)
            ->exists();

        if ($matched) {
            $this->cache[$productId] = true;

            return true;
        }

        $linked = DB::table('legacy_unmatched_products')
            ->where('status', 'linked')
            ->where('linked_product_id', $productId)
            ->exists();

        if ($linked) {
            $this->cache[$productId] = true;

            return true;
        }

        return false;
    }

    public function clearCache(): void
    {
        $this->cache = [];
    }
}
