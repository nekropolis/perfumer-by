<?php

namespace Modules\Checkout\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Warehouse\Models\StockReceiptItem;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variantIds = $this->items
            ->pluck('variant_id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $receiptItemsByVariant = $variantIds->isEmpty()
            ? collect()
            : StockReceiptItem::query()
                ->whereIn('variant_id', $variantIds->all())
                ->with(['receipt.warehouse'])
                ->orderByDesc('id')
                ->get()
                ->groupBy('variant_id');

        return [
            'id' => $this->id,
            'customer_name' => $this->customer_name,
            'phone' => $this->phone,
            'comment' => $this->comment,
            'status' => $this->status,
            'created_at' => $this->created_at?->toIso8601String(),
            'items_qty' => $this->items_qty,
            'subtotal' => number_format((float) $this->subtotal, 2, '.', ''),
            'total' => number_format((float) $this->total, 2, '.', ''),
            'items' => $this->items->map(function ($item) use ($receiptItemsByVariant) {
                $data = [
                    'id' => $item->id,
                    'product_id' => $item->product_id,
                    'variant_id' => $item->variant_id,
                    'product_name' => $item->product_name,
                    'product_slug' => $item->product_slug,
                    'brand_name' => $item->brand_name,
                    'variant_title' => $item->variant_title,
                    'sku' => $item->sku,
                    'qty' => $item->qty,
                    'price' => number_format((float) $item->price, 2, '.', ''),
                    'total' => number_format((float) $item->total, 2, '.', ''),
                ];

                // Supplier offers отдаём только когда явно подгружены (admin API).
                if ($item->relationLoaded('variant') && $item->variant
                    && $item->variant->relationLoaded('supplierOffers')
                ) {
                    $data['supplier_offers'] = $item->variant->supplierOffers
                        ->map(function ($offer) {
                            return [
                                'id' => $offer->id,
                                'supplier_id' => $offer->supplier_id,
                                'supplier_name' => $offer->supplier?->name,
                                'supplier_code' => $offer->supplier?->code,
                                'external_id' => $offer->external_id,
                                'external_product_name' => $offer->external_product_name,
                                'external_variant_name' => $offer->external_variant_name,
                                'external_product_url' => $offer->external_product_url,
                                'sku' => $offer->sku,
                                'price' => $offer->price !== null
                                    ? number_format((float) $offer->price, 2, '.', '')
                                    : null,
                                'purchase_price' => $offer->purchase_price !== null
                                    ? number_format((float) $offer->purchase_price, 2, '.', '')
                                    : null,
                                'stock' => (int) $offer->stock,
                                'is_preorder' => (bool) $offer->is_preorder,
                                'is_active' => (bool) $offer->is_active,
                                'last_synced_at' => $offer->last_synced_at?->toIso8601String(),
                            ];
                        })
                        ->values()
                        ->all();
                }

                if ($item->variant_id !== null) {
                    $receiptItems = $receiptItemsByVariant->get((int) $item->variant_id, collect());
                    $data['receipt_batches'] = $receiptItems
                        ->map(function (StockReceiptItem $receiptItem) {
                            $payload = is_array($receiptItem->payload) ? $receiptItem->payload : [];

                            return [
                                'receipt_item_id' => $receiptItem->id,
                                'receipt_id' => $receiptItem->stock_receipt_id,
                                'receipt_document_no' => $receiptItem->receipt?->document_no,
                                'supplier_name' => $receiptItem->receipt?->supplier_name,
                                'supplier_code' => $receiptItem->supplier_sku,
                                'supplier_product_name' => $payload['supplier_product_name']
                                    ?? $payload['name']
                                    ?? $receiptItem->variant_title,
                                'supplier_price' => $receiptItem->supplier_price !== null
                                    ? number_format((float) $receiptItem->supplier_price, 2, '.', '')
                                    : null,
                                'warehouse_name' => $receiptItem->receipt?->warehouse?->name,
                                'qty' => (int) ($receiptItem->qty ?? 0),
                                'received_at' => $receiptItem->receipt?->received_at?->toDateString(),
                            ];
                        })
                        ->values()
                        ->all();
                }

                return $data;
            })->values(),
        ];
    }
}
