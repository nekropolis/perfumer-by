<?php

namespace Modules\Checkout\Services;

use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\GiftCertificateIssueService;

class SoldGiftCertificateFromOrderService
{
    /**
     * При оформлении заказа: создаёт gift_certificates по строкам покупки (status new, код пустой).
     */
    public function issueFromPurchases(Order $order): void
    {
        $order->loadMissing('giftCertificatePurchases');
        foreach ($order->giftCertificatePurchases as $purchase) {
            $alreadyIssued = GiftCertificate::query()
                ->where('sold_order_id', $order->id)
                ->where('source', GiftCertificate::SOURCE_SOLD)
                ->where('template_id', $purchase->template_id)
                ->count();
            $toIssue = max(0, (int) $purchase->qty - (int) $alreadyIssued);

            for ($i = 0; $i < $toIssue; $i++) {
                app(GiftCertificateIssueService::class)->issue([
                    'template_id' => (int) $purchase->template_id,
                    'initial_amount' => (float) $purchase->amount,
                    'source' => GiftCertificate::SOURCE_SOLD,
                    'sold_order_id' => $order->id,
                    'issued_to_client_id' => $order->client_id,
                    'issued_phone' => $order->phone,
                    'comment' => 'Создан при оформлении заказа #'.$order->id,
                    'issued_at' => now()->toDateTimeString(),
                ]);
            }
        }
    }

    /**
     * При переводе заказа в «Выполнен»: sold-сертификаты со статусом new → active (код менеджер введёт позже).
     */
    public function activateSoldOnOrderCompleted(Order $order, string $previousStatus): void
    {
        if (in_array($previousStatus, ['done', 'completed'], true)) {
            return;
        }

        GiftCertificate::query()
            ->where('sold_order_id', $order->id)
            ->where('source', GiftCertificate::SOURCE_SOLD)
            ->where('status', GiftCertificate::STATUS_NEW)
            ->update(['status' => GiftCertificate::STATUS_ACTIVE]);
    }

    /**
     * При отмене заказа: проданные сертификаты, ещё не дошедшие до «Выполнен» (status new), аннулируем.
     */
    public function voidSoldAwaitingCompletion(Order $order): void
    {
        GiftCertificate::query()
            ->where('sold_order_id', $order->id)
            ->where('source', GiftCertificate::SOURCE_SOLD)
            ->where('status', GiftCertificate::STATUS_NEW)
            ->update(['status' => GiftCertificate::STATUS_VOID]);
    }
}
