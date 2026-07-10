<?php

namespace Modules\Cart\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Auth;
use Modules\Loyalty\Services\LoyaltyPricingService;
use Modules\Settings\Services\ShopSettingService;
use Modules\Users\Models\Client;

class CartResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $items = $this->items;
        $giftCertificateItems = $this->giftCertificateItems;
        $client = $request->user() ?? Auth::guard('sanctum')->user();
        $client = $client instanceof Client ? $client : null;

        $pricing = app(LoyaltyPricingService::class)->calculateForCart($this->resource, $client);

        $qty = (int) $items->sum('qty') + (int) $giftCertificateItems->sum('qty');
        $giftCertificatesSubtotal = (float) $giftCertificateItems->sum(function ($row) {
            return ((float) ($row->template?->amount ?? 0)) * (int) $row->qty;
        });
        $grandSubtotal = round((float) $pricing['subtotal'] + $giftCertificatesSubtotal, 2);
        $grandTotal = max(0, round((float) $pricing['total'] + $giftCertificatesSubtotal, 2));

        $shopSettings = app(ShopSettingService::class);

        return [
            'id' => $this->id,
            'token' => $this->token,
            'qty' => $qty,
            'subtotal' => number_format($grandSubtotal, 2, '.', ''),
            'total' => number_format($grandTotal, 2, '.', ''),
            'products_subtotal' => number_format((float) $pricing['subtotal'], 2, '.', ''),
            'gift_certificates_subtotal' => number_format($giftCertificatesSubtotal, 2, '.', ''),
            'gift_certificate' => $pricing['gift_certificate'] ? [
                'code' => $pricing['gift_certificate']->code,
                'number' => $pricing['gift_certificate']->number,
                'amount' => number_format((float) $pricing['gift_certificate_amount'], 2, '.', ''),
            ] : null,
            'discount_card' => $pricing['discount_card'] ? [
                'number' => $pricing['discount_card']->card_number,
                'discount_percent' => number_format((float) $pricing['loyalty_discount_percent'], 2, '.', ''),
                'discount_amount' => number_format((float) $pricing['loyalty_discount_amount'], 2, '.', ''),
                'session_only' => (bool) $this->discount_card_session_only,
            ] : null,
            'waiting_discount_delivery_date' => $shopSettings->get('waiting_discount_delivery_date', '10.07.2026'),
            'items' => CartItemResource::collection($items),
            'gift_certificate_items' => CartGiftCertificateItemResource::collection($giftCertificateItems),
        ];
    }
}
