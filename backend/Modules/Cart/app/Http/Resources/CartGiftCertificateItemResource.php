<?php

namespace Modules\Cart\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CartGiftCertificateItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $template = $this->template;
        $amount = (float) ($template?->amount ?? 0);
        $qty = (int) $this->qty;

        return [
            'id' => $this->id,
            'template_id' => $template?->id,
            'title' => $template?->title,
            'amount' => number_format($amount, 2, '.', ''),
            'qty' => $qty,
            'total' => number_format($amount * $qty, 2, '.', ''),
        ];
    }
}
