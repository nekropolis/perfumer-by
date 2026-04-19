<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductVariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');

        $stocksByWarehouse = WarehouseVariantStock::query()
            ->where('variant_id', $this->id)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get()
            ->keyBy('warehouse_id');

        $mainStock = $mainWarehouseId > 0 ? $stocksByWarehouse->get($mainWarehouseId) : null;
        $supplierStock = $supplierWarehouseId > 0 ? $stocksByWarehouse->get($supplierWarehouseId) : null;

        $presented = CatalogVariantStockPresenter::forListing($this->resource, $mainStock, $supplierStock);

        $effectivePrice = $this->price;
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
            'old_price' => $this->old_price,
            'discount_percent' => $this->discount_percent,

            'stock' => $presented['stock'],
            'available_stock' => $availableStock,
            'is_preorder' => $effectivePreorder,
            'is_available' => $presented['is_available'],
        ];
    }
}
