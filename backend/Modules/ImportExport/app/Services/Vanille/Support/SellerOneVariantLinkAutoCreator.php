<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\ProductDisplayName;

/**
 * Если продукт сматчился точно, но ProductVariantLink под объём/конц./тестер
 * ещё нет — создаёт линк из VariantDefinition (справочник), если definition есть.
 *
 * Seller One и приход XLS на склад используют один класс.
 */
class SellerOneVariantLinkAutoCreator
{
    public function __construct(
        private readonly SellerOneVariantMatcher $variantMatcher,
    ) {
    }

    /**
     * @param  array<string, mixed>  $parsed
     * @param  array{code?: string, title?: string, supplier_price?: mixed}  $row
     * @param  array<int, list<Product>>  $productsIndex
     * @return array<string, mixed>
     */
    public function apply(
        array $parsed,
        array $row,
        array $productsIndex,
        bool $requirePositiveSupplierPrice = true,
    ): array {
        $product = $parsed['suggested_product'] ?? null;
        if (! is_array($product)) {
            return $parsed;
        }

        $suggestedVariantBreakdown = is_array($parsed['suggested_variant'] ?? null)
            ? ($parsed['suggested_variant']['confidence_breakdown'] ?? null)
            : null;
        $breakdown = is_array($suggestedVariantBreakdown)
            ? $suggestedVariantBreakdown
            : ($product['confidence_breakdown'] ?? []);

        if (! empty($parsed['suggested_variant']) && ! empty($breakdown['volume_match'])) {
            return $parsed;
        }

        if (! empty($parsed['suggested_variant'])) {
            $parsed['suggested_variant'] = null;
            $parsed['selected_variant_id'] = null;
            $parsed['suggested_product']['has_variant'] = false;
        }

        $breakdown = $product['confidence_breakdown'] ?? [];
        $linkMatchLevel = (string) ($breakdown['link_match_level'] ?? 'none');
        if ($linkMatchLevel === 'variant_extra') {
            return $parsed;
        }

        $nameLevel = $breakdown['name_match_level'] ?? null;
        if (! in_array($nameLevel, ['exact', 'exact_multiset'], true)) {
            return $parsed;
        }

        $title = (string) ($row['title'] ?? '');
        $variantTail = $this->variantMatcher->splitNameAndVariantTail($title)['tail'] ?? '';
        if ($variantTail !== '' && $this->variantMatcher->supplierVariantTailBlocksAutoLink($variantTail)) {
            return $parsed;
        }

        $parsedData = $parsed['parsed'] ?? [];
        $volume = $parsedData['volume'] ?? null;
        $concentration = $parsedData['concentration'] ?? null;
        $isTester = (bool) ($parsedData['is_tester'] ?? false);
        $isVial = (bool) ($parsedData['is_vial'] ?? false);
        if ($volume === null || ! is_string($concentration) || $concentration === '') {
            return $parsed;
        }

        if ($requirePositiveSupplierPrice) {
            $supplierPrice = $this->variantMatcher->toFloat($row['supplier_price'] ?? null);
            if ($supplierPrice === null || $supplierPrice <= 0) {
                return $parsed;
            }
        }

        $productId = (int) ($product['id'] ?? 0);
        if ($productId <= 0) {
            return $parsed;
        }

        $productModel = null;
        foreach ($productsIndex as $productsInBrand) {
            foreach ($productsInBrand as $candidate) {
                if ((int) $candidate->id === $productId) {
                    $productModel = $candidate;
                    break 2;
                }
            }
        }

        $definitionVolumeMl = $this->variantMatcher->definitionVolumeMlForLookup(
            is_numeric($volume) ? (float) $volume : null,
        );
        if ($definitionVolumeMl === null) {
            return $parsed;
        }

        $definition = VariantDefinition::query()
            ->where('volume_ml', $definitionVolumeMl)
            ->where('concentration_code', $concentration)
            ->where('is_tester', $isTester)
            ->where('is_vial', $isVial)
            ->first();
        if (! $definition) {
            return $parsed;
        }

        $link = ProductVariantLink::query()->firstOrCreate(
            [
                'product_id' => $productId,
                'variant_definition_id' => $definition->id,
            ],
            [
                'price' => 0,
                'stock' => 0,
                'is_preorder' => false,
                'is_active' => false,
                'sort_order' => (int) ($definition->sort_order ?? 0),
            ]
        );
        $link->setRelation('definition', $definition);
        if ($productModel) {
            $link->setRelation('product', $productModel);

            $existingVariants = $productModel->variants;
            if ($existingVariants instanceof \Illuminate\Support\Collection) {
                $existingVariants->push($link);
            } else {
                $productModel->setRelation('variants', collect([$link]));
            }
        }

        $autoBreakdown = [
            'total' => 100,
            'name_percent' => 90.0,
            'name_points' => 80,
            'name_match_level' => 'exact',
            'link_match_level' => 'full',
            'volume_match' => $this->variantMatcher->volumesMatch(
                is_numeric($volume) ? (float) $volume : null,
                (float) $definition->volume_ml,
            ),
            'volume_points' => $this->variantMatcher->volumesMatch(
                is_numeric($volume) ? (float) $volume : null,
                (float) $definition->volume_ml,
            ) ? 12 : 0,
            'concentration_match' => true,
            'concentration_points' => 8,
            'tester_match' => true,
            'tester_points' => 0,
            'has_variant' => true,
            'auto_created_variant' => true,
        ];

        $parsed['suggested_variant'] = [
            'id' => $link->id,
            'product_id' => $link->product_id,
            'product_name' => $productModel?->name ?? ($product['name'] ?? null),
            'display_name' => $productModel
                ? ProductDisplayName::forProduct($productModel)
                : ProductDisplayName::format(
                    $product['brand_name'] ?? null,
                    (string) ($product['name'] ?? '')
                ),
            'brand_name' => $productModel?->brand?->name ?? ($product['brand_name'] ?? null),
            'display' => $this->variantMatcher->buildVariantLabel($link),
            'confidence' => 100,
            'confidence_breakdown' => $autoBreakdown,
        ];
        $parsed['suggested_product']['confidence'] = 100;
        $parsed['suggested_product']['confidence_breakdown'] = $autoBreakdown;
        $parsed['suggested_product']['has_variant'] = true;
        $parsed['suggested_product']['variants_count'] = (int) ($parsed['suggested_product']['variants_count'] ?? 0) + 1;
        $parsed['selected_variant_id'] = $link->id;

        return $parsed;
    }
}
