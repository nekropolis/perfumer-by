<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Warehouse\Models\WarehouseVariantStock;

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

        $effectiveOldPrice = $effectivePrice !== null ? $this->old_price : null;
        $effectivePreorder = $presented['is_preorder'];
        $availableStock = $presented['available_stock'];

        $displayParts = [];

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

        return [
            'id' => $this->id,

            'volume' => $this->volume,
            'volume_unit' => $this->volume_unit,
            'type' => $this->type,
            'concentration' => $this->concentration,
            'edition' => $this->edition,

            'display_name' => $displayName,

            'price' => $effectivePrice,
            'old_price' => $effectiveOldPrice,
            'discount_percent' => $effectivePrice !== null ? $this->discount_percent : null,

            'stock' => $presented['stock'],
            'available_stock' => $availableStock,
            'is_preorder' => $effectivePreorder,
            'is_available' => $presented['is_available'],
            'is_promotion' => (bool) $variant->is_promotion,

            /** Подсказка для админки: склад / поставщик (логика как у {@see CatalogVariantStockPresenter::forListing()}). */
            'fulfillment_tooltip' => self::adminFulfillmentTooltip($variant, $mainStock, $supplierStock),
        ];
    }

    /**
     * Краткое описание канала отгрузки для тултипа и умного поиска в админке.
     */
    public static function adminFulfillmentTooltip(
        ProductVariantLink $variant,
        ?WarehouseVariantStock $mainStock,
        ?WarehouseVariantStock $supplierStock,
    ): string {
        $preorder = (bool) $variant->is_preorder;

        $mainAvailable = $mainStock
            ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock)
            : 0;

        if ($mainAvailable > 0) {
            $core = "Склад · доступно {$mainAvailable} шт.";

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
