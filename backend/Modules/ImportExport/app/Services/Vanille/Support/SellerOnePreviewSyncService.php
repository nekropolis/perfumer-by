<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;

class SellerOnePreviewSyncService
{
    public function upsertPreviewRow(Supplier $supplier, array $parsed, callable $autoConfirmCallback): string
    {
        $externalCode = (string) ($parsed['code'] ?? '');
        $externalName = (string) ($parsed['title'] ?? '');
        $externalUrl = "supplier-xls://{$externalCode}";

        $existing = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('external_url', $externalUrl)
            ->first();

        $existingPayload = $existing && is_array($existing->payload) ? $existing->payload : [];
        $isNew = $existing ? (bool) ($existingPayload['is_new'] ?? false) : true;

        // Confidence/breakdown одинаковы у suggested_variant и suggested_product — кладём общий,
        // но берём из того, что заполнено (продукт может быть без варианта).
        $matchConfidence = (int) (
            $parsed['suggested_variant']['confidence']
            ?? $parsed['suggested_product']['confidence']
            ?? 0
        );
        $matchBreakdown = $parsed['suggested_variant']['confidence_breakdown']
            ?? $parsed['suggested_product']['confidence_breakdown']
            ?? null;

        $nextPayload = [
            ...$existingPayload,
            'source' => 'seller-one-xls',
            'external_code' => $externalCode,
            'supplier_price' => $parsed['supplier_price'] ?? null,
            'min_price' => $parsed['supplier_price'] ?? null,
            'parsed' => $parsed['parsed'] ?? [],
            'suggested_variant_id' => $parsed['suggested_variant']['id'] ?? null,
            'suggested_product_id' => $parsed['suggested_product']['id'] ?? null,
            'match_confidence' => $matchConfidence,
            'match_confidence_breakdown' => $matchBreakdown,
            'is_new' => $isNew,
            'last_parsed_at' => now()?->toDateTimeString(),
        ];

        if ($existing) {
            $existing->update([
                'external_name' => $externalName,
                'external_slug' => Str::slug($externalName),
                'brand_id' => $existing->brand_id ?? null,
                'is_active' => true,
                'last_seen_at' => now(),
                'payload' => $nextPayload,
            ]);

            $autoConfirmCallback($existing, $parsed);
            return 'updated';
        }

        $created = SupplierProduct::query()->create([
            'supplier_id' => $supplier->id,
            'brand_id' => null,
            'product_id' => null,
            'external_name' => $externalName,
            'external_slug' => Str::slug($externalName),
            'external_url' => $externalUrl,
            'is_linked' => false,
            'is_active' => true,
            'last_seen_at' => now(),
            'payload' => $nextPayload,
        ]);

        $autoConfirmCallback($created, $parsed);
        return 'inserted';
    }

    public function touchLinkedSupplierRow(SupplierProduct $supplierProduct, array $row): void
    {
        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];

        $supplierProduct->update([
            'external_name' => (string) ($row['title'] ?? $supplierProduct->external_name),
            'external_slug' => Str::slug((string) ($row['title'] ?? $supplierProduct->external_name)),
            'last_seen_at' => now(),
            'payload' => [
                ...$payload,
                'source' => 'seller-one-xls',
                'external_code' => (string) ($row['code'] ?? ''),
                'supplier_price' => $row['supplier_price'] ?? null,
                'min_price' => $row['supplier_price'] ?? null,
                'last_parsed_at' => now()?->toDateTimeString(),
            ],
        ]);
    }

    public function markMissingSupplierCodesAsPreorder(Supplier $supplier, array $codesInLatestPrice): int
    {
        $normalizedCodes = array_values(array_filter(array_map(
            static fn (mixed $code): string => trim((string) $code),
            $codesInLatestPrice
        ), static fn (string $code): bool => $code !== ''));

        $offersQuery = SupplierVariantOffer::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_active', true);

        if (!empty($normalizedCodes)) {
            $offersQuery->whereNotIn('external_id', $normalizedCodes);
        }

        $missingOffers = $offersQuery->get(['id', 'product_variant_id', 'payload']);
        if ($missingOffers->isEmpty()) {
            return 0;
        }

        $variantIds = $missingOffers
            ->pluck('product_variant_id')
            ->filter()
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        DB::transaction(function () use ($missingOffers, $variantIds) {
            foreach ($missingOffers as $offer) {
                $payload = is_array($offer->payload) ? $offer->payload : [];
                $offer->update([
                    'is_active' => false,
                    'is_preorder' => true,
                    'payload' => [
                        ...$payload,
                        'missing_in_latest_price' => true,
                        'missing_marked_at' => now()?->toDateTimeString(),
                    ],
                ]);
            }

            if (!empty($variantIds)) {
                ProductVariant::query()->whereIn('id', $variantIds)->update(['is_preorder' => true]);
            }
        });

        return count($variantIds);
    }
}
