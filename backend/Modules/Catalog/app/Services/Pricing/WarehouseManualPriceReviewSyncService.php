<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\WarehouseManualPriceReview;

final class WarehouseManualPriceReviewSyncService
{
    /**
     * @param  array{
     *     variant_id: int,
     *     product_id: int,
     *     product_name: string,
     *     variant_title: string,
     *     reason: string,
     *     warehouse_purchase: string,
     *     supplier_purchase: ?string,
     *     formula_input?: ?string,
     *     receipt_supplier_id: ?int,
     *     supplier_sku: ?string,
     *     supplier_external_code: ?string,
     *     manual_retail_price?: ?string,
     *     list_on_storefront?: bool,
     * }  $payload
     */
    public function queue(int $priceRefreshRunId, array $payload): WarehouseManualPriceReview
    {
        $existing = WarehouseManualPriceReview::query()
            ->active()
            ->where('variant_id', $payload['variant_id'])
            ->first();

        $data = [
            'product_id' => $payload['product_id'],
            'reason' => $payload['reason'],
            'warehouse_purchase' => $payload['warehouse_purchase'],
            'supplier_purchase' => $payload['supplier_purchase'],
            'receipt_supplier_id' => $payload['receipt_supplier_id'],
            'supplier_sku' => $payload['supplier_sku'],
            'supplier_external_code' => $payload['supplier_external_code'],
            'product_name' => $payload['product_name'],
            'variant_title' => $payload['variant_title'],
            'price_refresh_run_id' => $priceRefreshRunId,
            'resolved_at' => null,
        ];

        if (array_key_exists('formula_input', $payload)) {
            $data['formula_input'] = $payload['formula_input'];
        }
        if (array_key_exists('manual_retail_price', $payload)) {
            $data['manual_retail_price'] = $payload['manual_retail_price'];
        }
        if (array_key_exists('list_on_storefront', $payload)) {
            $data['list_on_storefront'] = (bool) $payload['list_on_storefront'];
        }

        if ($existing instanceof WarehouseManualPriceReview) {
            // Активный + зафиксированная цена: не перезаписывать, пока та же причина.
            $locked = $existing->list_on_storefront
                && $existing->manual_set_at !== null
                && (string) $existing->reason === (string) $payload['reason'];
            if ($locked) {
                unset(
                    $data['manual_retail_price'],
                    $data['list_on_storefront'],
                    $data['formula_input'],
                );
            }

            $existing->update($data);

            return $existing->fresh() ?? $existing;
        }

        return WarehouseManualPriceReview::query()->create([
            'variant_id' => $payload['variant_id'],
            ...$data,
        ]);
    }

    public function resolveByVariantId(int $variantId): void
    {
        WarehouseManualPriceReview::query()
            ->active()
            ->where('variant_id', $variantId)
            ->update(['resolved_at' => now()]);
    }

    /**
     * @param  list<int>  $activeVariantIds
     */
    public function resolveExcept(array $activeVariantIds): int
    {
        $query = WarehouseManualPriceReview::query()->active();
        if ($activeVariantIds !== []) {
            $query->whereNotIn('variant_id', $activeVariantIds);
        }

        return $query->update(['resolved_at' => now()]);
    }
}
