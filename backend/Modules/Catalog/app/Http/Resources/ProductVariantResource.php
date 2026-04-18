<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
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

        $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;
        $supplierAvailable = $supplierStock ? max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) : 0;

        $effectiveStockSource = $mainAvailable > 0 ? $mainStock : $supplierStock;
        $effectivePrice = $mainAvailable > 0 && $this->price !== null
            ? $this->price
            : $this->price;

        $effectivePreorder = (bool) $this->is_preorder;
        $availableStock = $effectiveStockSource
            ? max(0, (int) $effectiveStockSource->stock - (int) $effectiveStockSource->reserved_stock)
            : max(0, (int) $this->stock - (int) ($this->reserved_stock ?? 0));

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

            'stock' => $effectiveStockSource ? (int) $effectiveStockSource->stock : (int) $this->stock,
            'reserved_stock' => $effectiveStockSource ? (int) $effectiveStockSource->reserved_stock : (int) ($this->reserved_stock ?? 0),
            'available_stock' => $availableStock,
            'is_preorder' => $effectivePreorder,
            'is_active' => $this->is_active,
            'is_available' => $availableStock > 0 || $effectivePreorder,
        ];
    }
}
