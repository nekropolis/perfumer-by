<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockLotService;

class ProductVariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var ProductVariantLink $variant */
        $variant = $this->resource;

        $stockContext = CatalogListingStockContext::current();
        if ($stockContext === null) {
            $product = $variant->relationLoaded('product')
                ? $variant->product
                : $variant->product()->with('activeVariants')->first();
            $stockContext = CatalogListingStockContext::fromProducts(
                $product !== null ? collect([$product]) : collect(),
            );
        }

        $presented = $stockContext->presentedForListing($variant);
        $effectivePrice = $stockContext->storefrontVariantPrice($variant, $presented);
        [$mainStock, $supplierStock] = $stockContext->warehouseStocksForVariant($variant);

        $waitingPrice = $effectivePrice !== null && !(bool) $variant->is_promotion
            ? WaitingDiscountPricing::apply($effectivePrice)
            : null;

        $effectiveOldPrice = $effectivePrice !== null ? $this->old_price : null;
        $effectivePreorder = $presented['is_preorder'];
        $availableStock = $presented['available_stock'];

        $displayParts = [];

        if ($this->definition?->is_set || (bool) $this->is_set) {
            $volumeLabel = trim((string) ($this->definition?->volume_label ?? ''));
            $displayName = $volumeLabel !== '' ? 'Набор ('.$volumeLabel.')' : 'Набор';
        } else {
            if ($this->volume) {
                $displayParts[] = trim($this->volume . ' ' . $this->volume_unit);
            }

            if ($this->concentration) {
                $displayParts[] = strtoupper($this->concentration);
            }

            if ($this->edition) {
                $displayParts[] = $this->edition;
            }

            $displayName = !empty($displayParts)
                ? implode(' / ', $displayParts)
                : 'Нет вариантов';
        }

        $mainAvailable = $mainStock
            ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock)
            : 0;

        $mainMinPurchase = null;
        if ($mainAvailable > 0 && $mainStock) {
            $mainWarehouseId = (int) ($mainStock->warehouse_id ?? 0);
            if ($mainWarehouseId > 0) {
                $minMap = app(StockLotService::class)->minPurchaseByVariant([(int) $variant->id], $mainWarehouseId);
                $mainMinPurchase = $minMap[(int) $variant->id] ?? null;
            }
        }

        return [
            'id' => $this->id,

            'volume' => $this->volume,
            'volume_unit' => $this->volume_unit,
            'type' => $this->type,
            'concentration' => $this->concentration,
            'edition' => $this->edition,
            'is_set' => (bool) ($this->definition?->is_set || $this->is_set),
            'volume_label' => $this->definition?->volume_label,
            'set_components' => $this->when(
                (bool) ($this->definition?->is_set || $this->is_set),
                function () use ($variant) {
                    $set = $variant->relationLoaded('productSet')
                        ? $variant->productSet
                        : $variant->productSet()->with('components')->first();

                    if (! $set) {
                        return [];
                    }

                    $components = $set->relationLoaded('components')
                        ? $set->components
                        : $set->components()->get();

                    return $components->map(static fn ($row) => [
                        'id' => $row->id,
                        'volume_label' => $row->volume_label,
                        'concentration_label' => $row->concentration_label,
                        'sort_order' => (int) $row->sort_order,
                    ])->values()->all();
                },
                [],
            ),

            'display_name' => $displayName,

            'price' => $effectivePrice,
            'old_price' => $effectiveOldPrice,
            'waiting_price' => $waitingPrice,
            'waiting_discount_percent' => $waitingPrice !== null ? WaitingDiscountPricing::DISCOUNT_PERCENT : null,
            'discount_percent' => $effectivePrice !== null ? $this->discount_percent : null,

            'stock' => $presented['stock'],
            'available_stock' => $availableStock,
            'is_preorder' => $effectivePreorder,
            'is_available' => $presented['is_available'],
            'is_promotion' => (bool) $variant->is_promotion,
            'availability_source' => $presented['availability_source'],

            /** Подсказка для админки: склад / поставщик (логика как у {@see CatalogVariantStockPresenter::forListing()}). */
            'fulfillment_tooltip' => self::adminFulfillmentTooltip($variant, $mainStock, $supplierStock, $mainMinPurchase),
            'can_fulfill_main' => $mainStock
                ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) > 0
                : false,
            'can_fulfill_offer' => CatalogVariantStockPresenter::supplierListingActive($variant)
                || (
                    $supplierStock
                    && max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) > 0
                ),
        ];
    }

    /**
     * Краткое описание канала отгрузки для тултипа и умного поиска в админке.
     */
    public static function adminFulfillmentTooltip(
        ProductVariantLink $variant,
        ?WarehouseVariantStock $mainStock,
        ?WarehouseVariantStock $supplierStock,
        ?string $mainMinPurchasePrice = null,
    ): string {
        $preorder = (bool) $variant->is_preorder;

        $mainAvailable = $mainStock
            ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock)
            : 0;

        if ($mainAvailable > 0) {
            $core = "Склад · доступно {$mainAvailable} шт.";
            if ($mainMinPurchasePrice !== null && $mainMinPurchasePrice !== '') {
                $core .= ' · мин. '.$mainMinPurchasePrice;
            }

            return $preorder ? $core.' · предзаказ' : $core;
        }

        if (CatalogVariantStockPresenter::supplierListingActive($variant)) {
            return $preorder
                ? 'Поставщик · доступно по прайсу (канал отгрузки) · предзаказ'
                : 'Поставщик · доступно по прайсу (канал отгрузки)';
        }

        if ($supplierStock) {
            $supplierAvailable = max(
                0,
                (int) $supplierStock->stock - (int) $supplierStock->reserved_stock
            );

            if ($supplierAvailable > 0 || $preorder) {
                $core = "Склад поставщика · доступно {$supplierAvailable} шт.";

                return $preorder ? $core.' · предзаказ' : $core;
            }
        }

        $fallback = max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));

        if ($fallback > 0) {
            $core = "Остаток по карточке варианта · {$fallback} шт.";

            return $preorder ? $core.' · предзаказ' : $core;
        }

        return $preorder ? 'Предзаказ' : 'Нет в наличии';
    }
}
