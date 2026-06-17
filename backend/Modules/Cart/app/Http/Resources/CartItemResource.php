<?php

namespace Modules\Cart\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class CartItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variant = $this->variant;
        $product = $this->product;

        $availableStock = 0;
        $displayStock = 0;
        $displayReserved = 0;
        $isAvailable = false;
        $price = 0.0;

        if ($variant) {
            $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
            $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
            $rows = WarehouseVariantStock::query()
                ->where('variant_id', $variant->id)
                ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
                ->get()
                ->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $rows->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $rows->get($supplierWarehouseId) : null;
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
            $availableStock = $presented['available_stock'];
            $displayStock = $presented['stock'];
            $displayReserved = $presented['reserved_stock'];
            $isAvailable = $presented['is_available'];
            $price = CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented) ?? 0.0;
        }

        $total = $price * $this->qty;

        $displayParts = [];

        if ($variant?->volume) {
            $displayParts[] = trim($variant->volume . ' ' . $variant->volume_unit);
        }

        if ($variant?->concentration) {
            $displayParts[] = strtoupper($variant->concentration);
        }

        if ($variant?->edition) {
            $displayParts[] = $variant->edition;
        }

        $displayName = !empty($displayParts)
            ? implode(' / ', $displayParts)
            : ($variant?->title ?? '');

        return [
            'id' => $this->id,
            'qty' => $this->qty,

            'product_id' => $product?->id,
            'product_variant_id' => $variant?->id,

            'product_name' => $product?->name,
            'product_display_name' => $product
                ? ProductDisplayName::forProduct($product)
                : null,
            'product_slug' => $product?->slug,
            'brand_name' => $product?->brand?->name,

            'variant' => $variant ? [
                'id' => $variant->id,
                'title' => $variant->title,
                'display_name' => $displayName,
                'volume' => $variant->volume,
                'volume_unit' => $variant->volume_unit,
                'type' => $variant->type,
                'concentration' => $variant->concentration,
                'edition' => $variant->edition,
            ] : null,

            'price' => number_format($price, 2, '.', ''),
            'old_price' => $variant?->old_price
                ? number_format((float) $variant->old_price, 2, '.', '')
                : null,

            'total' => number_format($total, 2, '.', ''),
            'stock' => $variant ? $displayStock : 0,
            'reserved_stock' => $variant ? $displayReserved : 0,
            'available_stock' => $availableStock,
            'is_preorder' => (bool) ($variant?->is_preorder ?? false),
            'is_available' => $variant ? $isAvailable : false,
        ];
    }
}
