<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;

/**
 * Строка таблицы «Парсинг поставщиков». Вынесено из контроллера, чтобы одну и ту же
 * строку могли отдать и список, и точечные операции (связать / сбросить связку),
 * без перезагрузки всей страницы на фронте.
 */
final class SellerOneSupplierProductPresenter
{
    /**
     * @param  iterable<int, SupplierProduct>  $items
     * @param  list<int>  $supplierIds
     * @return list<array<string, mixed>>
     */
    public static function presentMany(iterable $items, array $supplierIds): array
    {
        $rows = $items instanceof Collection ? $items : collect($items);
        if ($rows->isEmpty()) {
            return [];
        }

        $maps = self::buildLookupMaps($rows, $supplierIds);

        return $rows->map(fn (SupplierProduct $item): array => self::presentRow($item, $maps))
            ->values()
            ->all();
    }

    /**
     * @param  list<int>|null  $supplierIds
     * @return array<string, mixed>
     */
    public static function presentOne(SupplierProduct $item, ?array $supplierIds = null): array
    {
        $item->loadMissing(['brand', 'product.brand', 'supplier']);
        $rows = collect([$item]);
        $maps = self::buildLookupMaps($rows, $supplierIds ?? [(int) $item->supplier_id]);

        return self::presentRow($item, $maps);
    }

    /**
     * @param  Collection<int, SupplierProduct>  $rows
     * @param  list<int>  $supplierIds
     * @return array{
     *     offers: Collection<string, SupplierVariantOffer>,
     *     suggested_variants: Collection<int, ProductVariant>,
     *     linked_variants: Collection<int, ProductVariant>,
     *     suggested_products: Collection<int, Product>,
     *     eligible_offers: array<int, list<SupplierVariantOffer>>
     * }
     */
    private static function buildLookupMaps(Collection $rows, array $supplierIds): array
    {
        $payloadIds = static fn (string $key): array => $rows
            ->map(fn (SupplierProduct $item) => is_array($item->payload) ? ($item->payload[$key] ?? null) : null)
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $externalCodes = $rows
            ->map(fn (SupplierProduct $item) => is_array($item->payload) ? ($item->payload['external_code'] ?? null) : null)
            ->filter()
            ->values()
            ->all();

        $offers = $externalCodes === []
            ? collect()
            : SupplierVariantOffer::query()
                ->whereIn('supplier_id', $supplierIds)
                ->whereIn('external_id', $externalCodes)
                ->with(['productVariant.product.brand'])
                ->get()
                ->keyBy(fn (SupplierVariantOffer $offer): string => $offer->supplier_id.'|'.$offer->external_id);

        $suggestedVariantIds = $payloadIds('suggested_variant_id');
        $linkedVariantIds = $payloadIds('linked_variant_id');
        $suggestedProductIds = $payloadIds('suggested_product_id');

        $suggestedVariants = $suggestedVariantIds === []
            ? collect()
            : ProductVariant::query()->whereIn('id', $suggestedVariantIds)->with(['product.brand'])->get()->keyBy('id');

        $linkedVariants = $linkedVariantIds === []
            ? collect()
            : ProductVariant::query()->whereIn('id', $linkedVariantIds)->with(['product.brand'])->get()->keyBy('id');

        // Продукты-кандидаты без варианта: нужны, чтобы показать «Создать вариант» в UI.
        $suggestedProducts = $suggestedProductIds === []
            ? collect()
            : Product::query()->whereIn('id', $suggestedProductIds)->with(['brand', 'variants'])->get()->keyBy('id');

        // Все варианты, для которых ниже спросим канал прайса: и из офферов, и из payload.
        $channelVariants = $offers
            ->map(fn (SupplierVariantOffer $offer) => $offer->productVariant)
            ->filter()
            ->concat($linkedVariants->values())
            ->unique(fn (ProductVariantLink $variant) => (int) $variant->id);

        return [
            'offers' => $offers,
            'suggested_variants' => $suggestedVariants,
            'linked_variants' => $linkedVariants,
            'suggested_products' => $suggestedProducts,
            'eligible_offers' => CatalogVariantStockPresenter::eligibleOffersForVariants($channelVariants),
        ];
    }

    /**
     * @param  array<string, mixed>  $maps
     * @return array<string, mixed>
     */
    private static function presentRow(SupplierProduct $item, array $maps): array
    {
        $payload = is_array($item->payload) ? $item->payload : [];
        $externalCode = (string) ($payload['external_code'] ?? '');
        $offer = $externalCode ? $maps['offers']->get($item->supplier_id.'|'.$externalCode) : null;
        $suggestedVariant = isset($payload['suggested_variant_id'])
            ? $maps['suggested_variants']->get((int) $payload['suggested_variant_id'])
            : null;
        $suggestedProduct = isset($payload['suggested_product_id'])
            ? $maps['suggested_products']->get((int) $payload['suggested_product_id'])
            : null;
        $linkedVariantFromPayload = isset($payload['linked_variant_id'])
            ? $maps['linked_variants']->get((int) $payload['linked_variant_id'])
            : null;
        $linkedVariant = $offer?->productVariant ?? $linkedVariantFromPayload;
        $catalogSupplierAvailable = $linkedVariant
            ? CatalogVariantStockPresenter::supplierListingActive(
                $linkedVariant,
                $maps['eligible_offers'][(int) $linkedVariant->id] ?? [],
            )
            : null;
        $supplierModel = $item->supplier;

        return [
            'id' => $item->id,
            'supplier' => $supplierModel ? [
                'id' => (int) $supplierModel->id,
                'name' => (string) $supplierModel->name,
                'code' => (string) $supplierModel->code,
            ] : null,
            'external_name' => $item->external_name,
            'external_slug' => $item->external_slug,
            'external_url' => $item->external_url,
            'is_linked' => (bool) $item->is_linked,
            'is_active' => (bool) $item->is_active,
            'link_parsing_active' => (bool) $item->link_parsing_active,
            'last_seen_at' => optional($item->last_seen_at)?->toDateTimeString(),
            'code' => $externalCode,
            'supplier_price' => $payload['supplier_price'] ?? ($payload['min_price'] ?? null),
            'price_file_in_stock' => array_key_exists('price_file_in_stock', $payload)
                ? $payload['price_file_in_stock']
                : null,
            'catalog_supplier_channel_available' => $catalogSupplierAvailable,
            'parsed' => $payload['parsed'] ?? null,
            'is_new' => (bool) ($payload['is_new'] ?? false),
            'match_confidence' => (int) ($payload['match_confidence'] ?? 0),
            'match_confidence_breakdown' => $payload['match_confidence_breakdown'] ?? null,
            'status' => $item->is_linked
                ? 'confirmed'
                : ((int) ($payload['match_confidence'] ?? 0) >= 1
                    && (!empty($payload['suggested_variant_id']) || !empty($payload['suggested_product_id']))
                    ? 'found_unconfirmed'
                    : ((bool) ($payload['is_new'] ?? false) ? 'new' : 'unlinked')),
            'brand' => $item->brand ? [
                'id' => $item->brand->id,
                'name' => $item->brand->name,
            ] : null,
            'product' => $item->product ? [
                'id' => $item->product->id,
                'name' => $item->product->name,
                'display_name' => ProductDisplayName::forProduct($item->product),
                'slug' => $item->product->slug,
            ] : null,
            'suggested_variant' => $suggestedVariant ? [
                'id' => $suggestedVariant->id,
                'product_id' => $suggestedVariant->product_id,
                'product_name' => $suggestedVariant->product?->name,
                'display_name' => $suggestedVariant->product
                    ? ProductDisplayName::forProduct($suggestedVariant->product)
                    : null,
                'brand_name' => $suggestedVariant->product?->brand?->name,
                'display' => self::variantDisplay($suggestedVariant),
            ] : null,
            'suggested_product' => $suggestedProduct ? [
                'id' => $suggestedProduct->id,
                'name' => $suggestedProduct->name,
                'display_name' => ProductDisplayName::forProduct($suggestedProduct),
                'slug' => $suggestedProduct->slug,
                'brand_name' => $suggestedProduct->brand?->name,
                'variants_count' => is_countable($suggestedProduct->variants)
                    ? count($suggestedProduct->variants)
                    : 0,
            ] : null,
            'linked_variant' => $linkedVariant ? [
                'id' => $linkedVariant->id,
                'product_id' => $linkedVariant->product_id,
                'product_name' => $linkedVariant->product?->name,
                'display_name' => $linkedVariant->product
                    ? ProductDisplayName::forProduct($linkedVariant->product)
                    : null,
                'brand_name' => $linkedVariant->product?->brand?->name,
                'display' => self::variantDisplay($linkedVariant),
            ] : null,
        ];
    }

    private static function variantDisplay(ProductVariantLink $variant): string
    {
        return trim(implode(' / ', array_filter([
            $variant->volume ? "{$variant->volume} {$variant->volume_unit}" : null,
            $variant->concentration ? strtoupper((string) $variant->concentration) : null,
            $variant->edition,
        ])));
    }
}
