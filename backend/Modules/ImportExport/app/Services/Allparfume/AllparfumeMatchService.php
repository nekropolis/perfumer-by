<?php

namespace Modules\ImportExport\Services\Allparfume;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Support\CatalogProductAttributeIds;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Models\AllparfumeProduct;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantLinkAutoCreator;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;

class AllparfumeMatchService
{
    public function __construct(
        private readonly SellerOneVariantMatcher $variantMatcher,
        private readonly SellerOneVariantLinkAutoCreator $variantLinkAutoCreator,
    ) {
    }

    /**
     * @return array{processed:int, linked:int, suggested:int, skipped:int}
     */
    public function autoMatch(?string $brandSlug = null, bool $onlyUnlinked = true): array
    {
        $stats = [
            'processed' => 0,
            'linked' => 0,
            'suggested' => 0,
            'skipped' => 0,
        ];

        $brands = Brand::query()->orderBy('name')->get();
        $rules = SellerOneMatchRule::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        $productsIndex = $this->buildProductsIndex();

        $query = AllparfumeVariant::query()
            ->with(['allparfumeProduct'])
            ->orderBy('id');

        if ($brandSlug !== null && $brandSlug !== '') {
            $query->whereHas('allparfumeProduct', static function ($q) use ($brandSlug): void {
                $q->where('brand_slug', $brandSlug);
            });
        }

        if ($onlyUnlinked) {
            $query->whereNull('product_variant_link_id');
        }

        $query->chunkById(100, function (Collection $variants) use (
            $brands,
            $rules,
            $productsIndex,
            &$stats,
            $onlyUnlinked,
        ): void {
            foreach ($variants as $variant) {
                if (! $variant instanceof AllparfumeVariant) {
                    continue;
                }

                if ($onlyUnlinked && $variant->product_variant_link_id) {
                    $stats['skipped']++;
                    continue;
                }

                $product = $variant->allparfumeProduct;
                if (! $product instanceof AllparfumeProduct) {
                    $stats['skipped']++;
                    continue;
                }

                $result = $this->matchVariant($variant, $product, $brands, $rules, $productsIndex);
                $stats['processed']++;
                if ($result === 'linked') {
                    $stats['linked']++;
                } elseif ($result === 'suggested') {
                    $stats['suggested']++;
                } else {
                    $stats['skipped']++;
                }
            }
        });

        return $stats;
    }

    public function forceLink(int $allparfumeVariantId, int $productVariantLinkId): void
    {
        $variant = AllparfumeVariant::query()->with('allparfumeProduct')->findOrFail($allparfumeVariantId);
        $link = ProductVariantLink::query()->with('product')->findOrFail($productVariantLinkId);
        if (! $link->product) {
            throw new \InvalidArgumentException('У выбранного варианта нет продукта каталога');
        }

        DB::transaction(function () use ($variant, $link): void {
            $payload = is_array($variant->match_payload) ? $variant->match_payload : [];
            $variant->fill([
                'product_variant_link_id' => $link->id,
                'match_status' => 'linked',
                'match_confidence' => 100,
                'match_payload' => [
                    ...$payload,
                    'link_type' => 'manual',
                    'linked_variant_id' => $link->id,
                    'suggested_variant_id' => $link->id,
                    'suggested_product_id' => $link->product_id,
                ],
            ]);
            $variant->save();

            $product = $variant->allparfumeProduct;
            if ($product) {
                $product->fill([
                    'product_id' => $link->product_id,
                    'match_status' => 'linked',
                    'match_confidence' => 100,
                ]);
                $product->save();
            }
        });
    }

    public function resetLink(int $allparfumeVariantId): void
    {
        $variant = AllparfumeVariant::query()->with('allparfumeProduct')->findOrFail($allparfumeVariantId);

        DB::transaction(function () use ($variant): void {
            $payload = is_array($variant->match_payload) ? $variant->match_payload : [];
            unset($payload['link_type'], $payload['linked_variant_id']);

            $variant->fill([
                'product_variant_link_id' => null,
                'match_status' => ! empty($payload['suggested_variant_id']) || ! empty($payload['suggested_product_id'])
                    ? 'suggested'
                    : 'unmatched',
                'match_payload' => $payload,
            ]);
            $variant->save();

            $this->refreshProductMatchState($variant->allparfumeProduct);
        });
    }

    /**
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, SellerOneMatchRule>  $rules
     * @param  array<int, list<Product>>  $productsIndex
     * @return 'linked'|'suggested'|'skipped'
     */
    private function matchVariant(
        AllparfumeVariant $variant,
        AllparfumeProduct $product,
        Collection $brands,
        Collection $rules,
        array $productsIndex,
    ): string {
        $title = $this->buildMatcherTitle($product, $variant);
        if ($title === '' || $this->variantMatcher->shouldSkipParsingTitle($title)) {
            $variant->fill([
                'match_status' => 'unmatched',
                'match_confidence' => null,
                'match_payload' => [
                    'matcher_title' => $title,
                    'skip' => true,
                ],
            ]);
            $variant->save();

            return 'skipped';
        }

        $row = [
            'code' => $variant->variant_key,
            'title' => $title,
            'supplier_price' => $variant->min_price,
            'in_stock' => true,
        ];

        $parsed = $this->variantMatcher->parseSupplierRow($row, $brands, $rules, $productsIndex);
        $parsed = $this->variantLinkAutoCreator->apply(
            $parsed,
            $row,
            $productsIndex,
            requirePositiveSupplierPrice: false,
        );

        $suggestedVariant = is_array($parsed['suggested_variant'] ?? null) ? $parsed['suggested_variant'] : null;
        $suggestedProduct = is_array($parsed['suggested_product'] ?? null) ? $parsed['suggested_product'] : null;
        $confidence = (int) ($suggestedVariant['confidence'] ?? $suggestedProduct['confidence'] ?? 0);
        $breakdown = is_array($suggestedVariant['confidence_breakdown'] ?? null)
            ? $suggestedVariant['confidence_breakdown']
            : (is_array($suggestedProduct['confidence_breakdown'] ?? null)
                ? $suggestedProduct['confidence_breakdown']
                : null);

        $payload = [
            'matcher_title' => $title,
            'parsed' => $parsed['parsed'] ?? null,
            'suggested_variant_id' => $suggestedVariant['id'] ?? null,
            'suggested_product_id' => $suggestedProduct['id'] ?? null,
            'match_confidence' => $confidence > 0 ? $confidence : null,
            'match_confidence_breakdown' => $breakdown,
            'suggested_variant_display' => $suggestedVariant['display'] ?? null,
            'suggested_product_name' => $suggestedProduct['display_name'] ?? $suggestedProduct['name'] ?? null,
        ];

        if ($this->shouldAutoLink($suggestedVariant)) {
            $linkId = (int) $suggestedVariant['id'];
            $link = ProductVariantLink::query()->with('product')->find($linkId);
            if ($link && $link->product) {
                $variant->fill([
                    'product_variant_link_id' => $link->id,
                    'match_status' => 'linked',
                    'match_confidence' => $confidence,
                    'match_payload' => [
                        ...$payload,
                        'link_type' => 'auto_100',
                        'linked_variant_id' => $link->id,
                    ],
                ]);
                $variant->save();

                $product->fill([
                    'product_id' => $link->product_id,
                    'match_status' => 'linked',
                    'match_confidence' => max((int) ($product->match_confidence ?? 0), $confidence),
                ]);
                $product->save();

                return 'linked';
            }
        }

        $hasSuggestion = ($suggestedVariant['id'] ?? null) || ($suggestedProduct['id'] ?? null);
        $variant->fill([
            'product_variant_link_id' => null,
            'match_status' => $hasSuggestion ? 'suggested' : 'unmatched',
            'match_confidence' => $confidence > 0 ? $confidence : null,
            'match_payload' => $payload,
        ]);
        $variant->save();

        if ($hasSuggestion && ! $product->product_id && ($suggestedProduct['id'] ?? null)) {
            $product->fill([
                'product_id' => null,
                'match_status' => 'suggested',
                'match_confidence' => $confidence > 0 ? $confidence : null,
                'match_payload' => [
                    'suggested_product_id' => $suggestedProduct['id'],
                ],
            ]);
            $product->save();
        }

        return $hasSuggestion ? 'suggested' : 'skipped';
    }

    /**
     * @param  array<string, mixed>|null  $suggestedVariant
     */
    private function shouldAutoLink(?array $suggestedVariant): bool
    {
        if ($suggestedVariant === null) {
            return false;
        }

        $confidence = (int) ($suggestedVariant['confidence'] ?? 0);
        $variantId = (int) ($suggestedVariant['id'] ?? 0);
        if ($confidence < 100 || $variantId <= 0) {
            return false;
        }

        $nameLevel = (string) ($suggestedVariant['confidence_breakdown']['name_match_level'] ?? '');

        return in_array($nameLevel, ['exact', 'exact_multiset'], true);
    }

    public function buildMatcherTitle(AllparfumeProduct $product, AllparfumeVariant $variant): string
    {
        $brand = trim((string) ($product->brand_name ?: ''));
        $name = trim((string) ($product->name ?: $product->title ?: ''));
        $label = trim((string) $variant->raw_label);

        if ($brand !== '' && $name !== '' && str_starts_with(mb_strtolower($name), mb_strtolower($brand))) {
            $brand = '';
        }

        return trim(preg_replace('/\s+/u', ' ', implode(' ', array_filter([$brand, $name, $label], static fn ($v) => $v !== ''))) ?? '');
    }

    private function refreshProductMatchState(?AllparfumeProduct $product): void
    {
        if (! $product) {
            return;
        }

        $linked = AllparfumeVariant::query()
            ->where('allparfume_product_id', $product->id)
            ->whereNotNull('product_variant_link_id')
            ->with('productVariantLink')
            ->get();

        if ($linked->isEmpty()) {
            $product->fill([
                'product_id' => null,
                'match_status' => 'unmatched',
                'match_confidence' => null,
            ]);
            $product->save();

            return;
        }

        $productId = $linked
            ->map(static fn (AllparfumeVariant $v) => $v->productVariantLink?->product_id)
            ->filter()
            ->first();

        $product->fill([
            'product_id' => $productId,
            'match_status' => 'linked',
            'match_confidence' => 100,
        ]);
        $product->save();
    }

    /**
     * @return array<int, list<Product>>
     */
    private function buildProductsIndex(): array
    {
        $products = Product::query()
            ->with([
                'brand',
                'variants.definition',
                'attributeValues' => static fn ($q) => $q->where(
                    'product_attribute_id',
                    CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID,
                ),
                'attributeValues.selectedOptions',
            ])
            ->get();

        $grouped = [];
        foreach ($products as $product) {
            if (! $product->brand_id) {
                continue;
            }
            $grouped[$product->brand_id][] = $product;
        }

        return $grouped;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, ProductVariantLink>|null  $linksById
     * @param  \Illuminate\Support\Collection<int, Product>|null  $productsById
     * @return array<string, mixed>
     */
    public function serializeVariant(
        AllparfumeVariant $variant,
        $linksById = null,
        $productsById = null,
    ): array {
        $product = $variant->allparfumeProduct;
        $payload = is_array($variant->match_payload) ? $variant->match_payload : [];

        $suggestedVariantId = (int) ($payload['suggested_variant_id'] ?? 0);
        $suggestedProductId = (int) ($payload['suggested_product_id'] ?? 0);
        $linkedVariantId = (int) ($variant->product_variant_link_id ?? $payload['linked_variant_id'] ?? 0);

        $resolveLink = static function (int $id) use ($linksById): ?ProductVariantLink {
            if ($id <= 0) {
                return null;
            }
            if ($linksById !== null) {
                $found = $linksById->get($id);

                return $found instanceof ProductVariantLink ? $found : null;
            }

            return ProductVariantLink::query()->with('product.brand')->find($id);
        };

        $resolveProduct = static function (int $id) use ($productsById): ?Product {
            if ($id <= 0) {
                return null;
            }
            if ($productsById !== null) {
                $found = $productsById->get($id);

                return $found instanceof Product ? $found : null;
            }

            return Product::query()->with(['brand', 'variants'])->find($id);
        };

        $suggestedVariant = $resolveLink($suggestedVariantId);
        $linkedVariant = $resolveLink($linkedVariantId);
        $suggestedProduct = $resolveProduct($suggestedProductId);

        $isLinked = $variant->product_variant_link_id !== null;
        $confidence = (int) ($variant->match_confidence ?? $payload['match_confidence'] ?? 0);
        $breakdown = is_array($payload['match_confidence_breakdown'] ?? null)
            ? $payload['match_confidence_breakdown']
            : null;
        $parsed = is_array($payload['parsed'] ?? null) ? $payload['parsed'] : [
            'brand' => $product?->brand_name,
            'product_name' => $product?->name,
            'volume' => $variant->volume_ml !== null ? (float) $variant->volume_ml : null,
            'concentration' => $variant->concentration_code,
            'is_tester' => (bool) $variant->is_tester,
            'is_vial' => (bool) $variant->is_vial,
            'is_miniature' => (bool) $variant->is_miniature,
        ];

        $sourceBrand = trim((string) ($product?->brand_name ?: ''));
        $sourceName = trim((string) ($product?->name ?: $product?->title ?: ''));
        $variantLabel = trim((string) ($variant->raw_label ?: ''));

        $productLine = trim(implode(' ', array_filter([$sourceBrand, $sourceName], static fn ($v) => $v !== '')));
        $externalName = trim(implode(' — ', array_filter([$productLine, $variantLabel], static fn ($v) => $v !== '')));

        $status = 'unlinked';
        if ($isLinked) {
            $status = 'confirmed';
        } elseif ($suggestedVariant || $suggestedProduct) {
            $status = 'found_unconfirmed';
        }

        $catalogBrand = $linkedVariant?->product?->brand
            ?? $suggestedVariant?->product?->brand
            ?? $suggestedProduct?->brand;

        $offers = [];
        if ($variant->relationLoaded('shopOffers')) {
            foreach ($variant->shopOffers as $offer) {
                $offers[] = [
                    'shop_key' => $offer->shop_key,
                    'shop_name' => $offer->shop_name,
                    'price' => $offer->price,
                    'offer_url' => $offer->offer_url,
                ];
            }
        }

        $offersCount = array_key_exists('shop_offers_count', $variant->getAttributes())
            || isset($variant->shop_offers_count)
            ? (int) $variant->shop_offers_count
            : count($offers);

        return [
            'id' => $variant->id,
            'allparfume_product_id' => $variant->allparfume_product_id,
            'brand_slug' => $product?->brand_slug,
            'source_brand_name' => $sourceBrand !== '' ? $sourceBrand : null,
            'source_product_name' => $sourceName !== '' ? $sourceName : null,
            'external_name' => $externalName !== '' ? $externalName : ($variant->variant_key ?: '#'.$variant->id),
            'external_slug' => $product?->external_slug,
            'external_url' => $product?->source_url,
            'variant_key' => $variant->variant_key,
            'raw_label' => $variant->raw_label,
            'min_price' => $variant->min_price,
            'offers_count' => $offersCount,
            'shop_offers' => $offers,
            'is_linked' => $isLinked,
            'match_confidence' => $confidence,
            'match_confidence_breakdown' => $breakdown,
            'status' => $status,
            'parsed' => $parsed,
            'brand' => $catalogBrand ? [
                'id' => $catalogBrand->id,
                'name' => $catalogBrand->name,
            ] : ($sourceBrand !== '' ? [
                'id' => 0,
                'name' => $sourceBrand,
            ] : null),
            'product' => $linkedVariant?->product ? [
                'id' => $linkedVariant->product->id,
                'name' => $linkedVariant->product->name,
                'display_name' => ProductDisplayName::forProduct($linkedVariant->product),
                'slug' => $linkedVariant->product->slug,
            ] : null,
            'suggested_variant' => $suggestedVariant ? [
                'id' => $suggestedVariant->id,
                'product_id' => $suggestedVariant->product_id,
                'product_name' => $suggestedVariant->product?->name,
                'display_name' => $suggestedVariant->product
                    ? ProductDisplayName::forProduct($suggestedVariant->product)
                    : null,
                'brand_name' => $suggestedVariant->product?->brand?->name,
                'display' => $this->variantMatcher->buildVariantLabel($suggestedVariant),
            ] : null,
            'suggested_product' => $suggestedProduct ? [
                'id' => $suggestedProduct->id,
                'name' => $suggestedProduct->name,
                'display_name' => ProductDisplayName::forProduct($suggestedProduct),
                'slug' => $suggestedProduct->slug,
                'brand_name' => $suggestedProduct->brand?->name,
                'variants_count' => $suggestedProduct->relationLoaded('variants')
                    ? $suggestedProduct->variants->count()
                    : $suggestedProduct->variants()->count(),
            ] : null,
            'linked_variant' => $linkedVariant ? [
                'id' => $linkedVariant->id,
                'product_id' => $linkedVariant->product_id,
                'product_name' => $linkedVariant->product?->name,
                'display_name' => $linkedVariant->product
                    ? ProductDisplayName::forProduct($linkedVariant->product)
                    : null,
                'brand_name' => $linkedVariant->product?->brand?->name,
                'display' => $this->variantMatcher->buildVariantLabel($linkedVariant),
                'price' => $linkedVariant->price,
            ] : null,
            'site_price' => $isLinked && $linkedVariant ? $linkedVariant->price : null,
        ];
    }
}
