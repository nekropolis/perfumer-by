<?php

namespace Modules\ImportExport\Services\Allparfume;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\ImportExport\Models\AllparfumeProduct;
use Modules\ImportExport\Models\AllparfumeVariant;

class AllparfumeCatalogFeedService
{
    /**
     * Все варианты витрины в наличии. Allparfume-поля — если есть связь.
     *
     * @return array{updated_at:string,items:list<array<string,mixed>>}
     */
    public function build(): array
    {
        $query = ProductVariantLink::query()
            ->with(['product:id,slug,is_active', 'definition'])
            ->whereHas('product', static function ($productQuery): void {
                $productQuery->where('is_active', true)
                    ->whereNotNull('slug')
                    ->where('slug', '!=', '');
            });
        CatalogVariantStockPresenter::applyStorefrontInStockScope($query);
        $links = $query
            ->orderBy('product_id')
            ->orderBy('id')
            ->get();

        $stockContext = CatalogListingStockContext::fromVariantLinks($links);

        /** @var list<array{link: ProductVariantLink, price: float}> $eligible */
        $eligible = [];
        foreach ($links as $link) {
            if (! $link instanceof ProductVariantLink) {
                continue;
            }
            $catalog = $link->product;
            if (! $catalog instanceof Product) {
                continue;
            }

            $presented = $stockContext->presentedForListing($link);
            if (empty($presented['is_available'])
                || ! empty($presented['is_preorder'])
                || (bool) $link->is_preorder
            ) {
                continue;
            }

            $price = $stockContext->storefrontVariantPrice($link, $presented);
            if ($price === null || $price <= 0) {
                continue;
            }

            $eligible[] = [
                'link' => $link,
                'price' => $this->variantFeedPrice($price, $presented, (bool) $link->is_promotion),
            ];
        }

        $allparfumeByProductId = $this->allparfumeByCatalogProductId(
            array_map(static fn (array $row): ProductVariantLink => $row['link'], $eligible),
        );

        $grouped = [];
        foreach ($eligible as $row) {
            $link = $row['link'];
            $catalog = $link->product;
            if (! $catalog instanceof Product) {
                continue;
            }

            $catalogId = (int) $catalog->id;
            $allparfume = $allparfumeByProductId->get($catalogId);
            $groupKey = $allparfume instanceof AllparfumeProduct
                ? 'ap:'.$allparfume->id
                : 'p:'.$catalogId;

            if (! isset($grouped[$groupKey])) {
                $sourceUrl = $allparfume instanceof AllparfumeProduct
                    ? trim((string) $allparfume->source_url)
                    : '';
                $grouped[$groupKey] = [
                    'perfumer_url' => $this->feedPerfumerUrls($allparfume, $catalog),
                    'allparfume_url' => $sourceUrl !== '' ? $sourceUrl : null,
                    'allparfume_id' => $allparfume instanceof AllparfumeProduct && $allparfume->external_id !== null
                        ? (int) $allparfume->external_id
                        : null,
                    'variants' => [],
                ];
            } elseif ($allparfume instanceof AllparfumeProduct && $allparfume->idFilePerfumerUrls() === []) {
                $url = $this->catalogUrl($catalog);
                if (! in_array($url, $grouped[$groupKey]['perfumer_url'], true)) {
                    $grouped[$groupKey]['perfumer_url'][] = $url;
                }
            }

            $grouped[$groupKey]['variants'][] = [
                'variant' => $this->variantLabel($link),
                'price' => number_format($row['price'], 2, '.', ''),
            ];
        }

        $items = array_values(array_filter(
            $grouped,
            static fn (array $item): bool => $item['variants'] !== [],
        ));
        usort($items, static fn (array $a, array $b): int => strcmp(
            implode("\n", $a['perfumer_url']),
            implode("\n", $b['perfumer_url']),
        ));

        return [
            'updated_at' => now()->toIso8601String(),
            'items' => $items,
        ];
    }

    /**
     * @param  list<ProductVariantLink>  $links
     * @return Collection<int, AllparfumeProduct>
     */
    private function allparfumeByCatalogProductId(array $links): Collection
    {
        $productIdByLinkId = [];
        $productIds = [];
        foreach ($links as $link) {
            $linkId = (int) $link->id;
            $productId = (int) $link->product_id;
            $productIdByLinkId[$linkId] = $productId;
            $productIds[] = $productId;
        }
        $productIds = array_values(array_unique($productIds));
        $linkIds = array_keys($productIdByLinkId);

        $map = collect();
        if ($productIds !== []) {
            $pinned = AllparfumeProduct::query()
                ->where(function ($query) use ($productIds): void {
                    $query->whereIn('product_id', $productIds)
                        ->orWhereNotNull('payload->id_file_product_ids');
                })
                ->get();
            foreach ($pinned as $row) {
                if ($row instanceof AllparfumeProduct) {
                    foreach ($row->catalogProductIds() as $catalogProductId) {
                        $this->preferAllparfume($map, $catalogProductId, $row);
                    }
                }
            }
        }

        if ($linkIds !== []) {
            $linked = AllparfumeVariant::query()
                ->whereIn('product_variant_link_id', $linkIds)
                ->with('allparfumeProduct')
                ->get();
            foreach ($linked as $variant) {
                if (! $variant instanceof AllparfumeVariant) {
                    continue;
                }
                $allparfume = $variant->allparfumeProduct;
                $catalogProductId = $productIdByLinkId[(int) $variant->product_variant_link_id] ?? 0;
                if ($allparfume instanceof AllparfumeProduct && $catalogProductId > 0) {
                    $this->preferAllparfume($map, $catalogProductId, $allparfume);
                }
            }
        }

        return $map;
    }

    /**
     * @return list<string>
     */
    private function feedPerfumerUrls(?AllparfumeProduct $allparfume, Product $catalog): array
    {
        if ($allparfume instanceof AllparfumeProduct) {
            $stored = $allparfume->idFilePerfumerUrls();
            if ($stored !== []) {
                return $stored;
            }
        }

        return [$this->catalogUrl($catalog)];
    }

    private function catalogUrl(Product $catalog): string
    {
        return rtrim((string) config('app.url'), '/').'/'.$catalog->slug;
    }

    /**
     * Офер (`supplier_only`, `main+supplier`) — цена со скидкой 3% за ожидание.
     * Только склад (`main`) — цена без скидки.
     *
     * @param  array{availability_source?: string}  $presented
     */
    private function variantFeedPrice(float $storefrontPrice, array $presented, bool $isPromotion): float
    {
        if ($isPromotion) {
            return $storefrontPrice;
        }

        $source = (string) ($presented['availability_source'] ?? '');
        if ($source !== 'supplier_only' && $source !== 'main+supplier') {
            return $storefrontPrice;
        }

        return WaitingDiscountPricing::apply($storefrontPrice);
    }

    private function variantLabel(ProductVariantLink $link): string
    {
        $definition = $link->definition;
        if ($definition !== null && $definition->is_set) {
            return $definition->displayTitle();
        }

        $parts = [];
        $volume = $definition?->volume_ml;
        if ($volume !== null && $volume !== '') {
            $parts[] = trim((string) $volume.' мл');
        }
        $code = strtoupper(trim((string) ($definition?->concentration_code ?? '')));
        if ($code !== '') {
            $parts[] = $code;
        }
        if ($definition?->is_tester) {
            $parts[] = 'Тестер';
        } elseif ($definition?->is_vial) {
            $parts[] = 'Пробник';
        } elseif ($definition?->is_miniature) {
            $parts[] = 'Миниатюра';
        }

        if ($parts !== []) {
            return implode(' / ', $parts);
        }

        return trim((string) $link->title);
    }

    /**
     * @param  Collection<int, AllparfumeProduct>  $map
     */
    private function preferAllparfume(Collection $map, int $catalogProductId, AllparfumeProduct $candidate): void
    {
        $current = $map->get($catalogProductId);
        if (! $current instanceof AllparfumeProduct) {
            $map->put($catalogProductId, $candidate);

            return;
        }

        $currentScore = ($current->external_id !== null ? 2 : 0)
            + (trim((string) $current->source_url) !== '' ? 1 : 0);
        $nextScore = ($candidate->external_id !== null ? 2 : 0)
            + (trim((string) $candidate->source_url) !== '' ? 1 : 0);
        if ($nextScore > $currentScore) {
            $map->put($catalogProductId, $candidate);
        }
    }
}
