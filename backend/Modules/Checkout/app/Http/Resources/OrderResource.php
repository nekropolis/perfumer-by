<?php

namespace Modules\Checkout\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Warehouse\Models\StockReceiptItem;

class OrderResource extends JsonResource
{
    private const TRADEMARK_COUNTRY_ATTRIBUTE = 'страна тм';

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

        $giftLines = $this->relationLoaded('orderGiftCertificates')
            ? $this->orderGiftCertificates
            : $this->orderGiftCertificates()->get();
        $firstGift = $giftLines->first();
        $giftFromOrder = (float) ($this->gift_certificate_amount ?? 0);
        $giftTotalFromPivot = $giftLines->sum(fn ($row) => (float) $row->amount_applied);
        $giftTotal = $giftFromOrder > 0.0001 ? $giftFromOrder : $giftTotalFromPivot;
        $giftCode = $this->gift_certificate_code ?: $firstGift?->code_snapshot;
        $discountAmount = $this->resolveDiscountAmount($giftTotal);

        $numberFromSnapshot = trim((string) ($this->discount_card_number ?? ''));
        $numberFromRelation = '';
        if ($this->relationLoaded('discountCard') && $this->discountCard) {
            $numberFromRelation = trim((string) ($this->discountCard->card_number ?? ''));
        }
        $displayDiscountCardNumber = $numberFromSnapshot !== '' ? $numberFromSnapshot : ($numberFromRelation !== '' ? $numberFromRelation : null);

        $pctSnapshot = (float) ($this->discount_percent_snapshot ?? 0);
        $subtotalF = (float) $this->subtotal;
        $displayDiscountPercent = $pctSnapshot > 0.0001
            ? $pctSnapshot
            : ($subtotalF > 0.0001 && $discountAmount > 0.0001
                ? round($discountAmount / $subtotalF * 100, 2)
                : 0.0);

        $deliveryMethod = (string) ($this->delivery_method ?? '');
        $paymentMethod = (string) ($this->payment_method ?? '');
        $deliveryCity = $deliveryMethod === CheckoutDeliveryService::METHOD_MINSK
            ? CheckoutDeliveryService::MINSK_CITY
            : $this->delivery_city;

        return [
            'id' => $this->id,
            'customer_name' => $this->customer_name,
            'phone' => $this->phone,
            'comment' => $this->comment,
            'status' => $this->status,
            'created_at' => $this->created_at?->toIso8601String(),
            'items_qty' => $this->items_qty,
            'subtotal' => number_format((float) $this->subtotal, 2, '.', ''),
            'delivery_method' => $deliveryMethod !== '' ? $deliveryMethod : null,
            'delivery_method_label' => $this->deliveryMethodLabel($deliveryMethod),
            'delivery_city' => $deliveryCity,
            'delivery_address' => $this->delivery_address,
            'delivery_fee' => number_format((float) ($this->delivery_fee ?? 0), 2, '.', ''),
            'payment_method' => $paymentMethod !== '' ? $paymentMethod : null,
            'payment_method_label' => $this->paymentMethodLabel($paymentMethod),
            'total' => number_format((float) $this->total, 2, '.', ''),
            'gift_certificate_code' => $giftCode,
            'gift_certificate_number' => $giftCode,
            'gift_certificate_amount' => number_format($giftTotal, 2, '.', ''),
            'gift_certificates' => $giftLines->map(function ($row) {
                $nominal = $row->relationLoaded('giftCertificate') && $row->giftCertificate
                    ? (float) $row->giftCertificate->initial_amount
                    : null;
                $balance = $row->relationLoaded('giftCertificate') && $row->giftCertificate
                    ? (float) $row->giftCertificate->balance_amount
                    : null;

                return [
                    'code' => $row->code_snapshot,
                    'amount_applied' => number_format((float) $row->amount_applied, 2, '.', ''),
                    'nominal_amount' => $nominal !== null ? number_format($nominal, 2, '.', '') : null,
                    'balance_amount' => $balance !== null ? number_format($balance, 2, '.', '') : null,
                ];
            })->values()->all(),
            'gift_certificate_purchases' => $this->giftCertificatePurchasesForResource(),
            'sold_gift_certificates' => $this->soldGiftCertificatesForResource(),
            'discount_card_id' => $this->discount_card_id !== null ? (int) $this->discount_card_id : null,
            'discount_card_number' => $displayDiscountCardNumber,
            'discount_percent_snapshot' => number_format((float) $displayDiscountPercent, 2, '.', ''),
            'discount_amount' => number_format($discountAmount, 2, '.', ''),
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
                    'product_country' => $this->productCountry($item),
                    'image' => $item->relationLoaded('product')
                        ? ($item->product?->mainImage?->path ?? null)
                        : null,
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

    /**
     * @return list<array{id:int, template_id:int, template_title:string, amount:string, qty:int, total:string}>
     */
    private function giftCertificatePurchasesForResource(): array
    {
        $rows = $this->relationLoaded('giftCertificatePurchases')
            ? $this->giftCertificatePurchases
            : $this->giftCertificatePurchases()->get();

        return $rows
            ->map(function ($row) {
                return [
                    'id' => (int) $row->id,
                    'template_id' => (int) $row->template_id,
                    'template_title' => (string) $row->template_title,
                    'amount' => number_format((float) $row->amount, 2, '.', ''),
                    'qty' => (int) $row->qty,
                    'total' => number_format((float) $row->total, 2, '.', ''),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return list<array{id:int, template_id:int|null, template_title:string|null, status:string, code:string|null, initial_amount:string, balance_amount:string}>
     */
    private function soldGiftCertificatesForResource(): array
    {
        $rows = $this->relationLoaded('soldGiftCertificates')
            ? $this->soldGiftCertificates
            : $this->soldGiftCertificates()->get();
        $rows->loadMissing('template');

        return $rows
            ->map(function ($row) {
                $title = $row->template?->title;

                $rawCode = $row->getAttributes()['code'] ?? null;
                $code = ($rawCode !== null && trim((string) $rawCode) !== '') ? trim((string) $rawCode) : null;

                return [
                    'id' => (int) $row->id,
                    'template_id' => $row->template_id !== null ? (int) $row->template_id : null,
                    'template_title' => $title !== null && $title !== '' ? (string) $title : null,
                    'status' => (string) $row->status,
                    'code' => $code,
                    'initial_amount' => number_format((float) $row->initial_amount, 2, '.', ''),
                    'balance_amount' => number_format((float) $row->balance_amount, 2, '.', ''),
                ];
            })
            ->values()
            ->all();
    }

    private function deliveryMethodLabel(string $method): ?string
    {
        return match ($method) {
            CheckoutDeliveryService::METHOD_MINSK => 'Курьер по Минску',
            CheckoutDeliveryService::METHOD_BELARUS => 'Курьер по РБ',
            CheckoutDeliveryService::METHOD_PICKUP => 'Самовывоз',
            '' => null,
            default => $method,
        };
    }

    private function productCountry($item): ?string
    {
        if (! $item->relationLoaded('product') || ! $item->product?->relationLoaded('attributeValues')) {
            return null;
        }

        foreach ($item->product->attributeValues as $value) {
            $attributeName = mb_strtolower(trim((string) ($value->productAttribute?->name ?? '')));
            if ($attributeName !== self::TRADEMARK_COUNTRY_ATTRIBUTE) {
                continue;
            }

            if ($value->relationLoaded('selectedOptions')) {
                $option = $value->selectedOptions->first(fn ($selected) => $selected->productAttributeOption !== null);
                $optionName = trim((string) ($option?->productAttributeOption?->name ?? ''));
                if ($optionName !== '') {
                    return $optionName;
                }
            }

            $customValue = trim((string) ($value->custom_value ?? ''));
            return $customValue !== '' ? $customValue : null;
        }

        return null;
    }

    private function paymentMethodLabel(string $method): ?string
    {
        return match ($method) {
            'cash' => 'Наличными',
            'card' => 'Картой (Visa / Mastercard)',
            '' => null,
            default => $method,
        };
    }

    private function resolveDiscountAmount(float $giftAmount): float
    {
        $storedDiscount = round((float) $this->discount_amount, 2);
        if ($storedDiscount > 0.0001) {
            return $storedDiscount;
        }

        // Fallback for legacy data: derive discount from monetary snapshots.
        $subtotal = round((float) $this->subtotal, 2);
        $deliveryFee = round((float) ($this->delivery_fee ?? 0), 2);
        $total = round((float) $this->total, 2);
        $inferredDiscount = round($subtotal + $deliveryFee - $giftAmount - $total, 2);

        return $inferredDiscount > 0.0001 ? $inferredDiscount : 0.0;
    }
}
