<?php

namespace Modules\Loyalty\Services;

use Illuminate\Support\Facades\DB;
use Modules\Cart\Models\Cart;
use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\GiftCertificateTransaction;
use Modules\Loyalty\Models\OrderGiftCertificate;

class GiftCertificateLedgerService
{
    public function certificateIsUsable(?GiftCertificate $cert): bool
    {
        if (!$cert) {
            return false;
        }
        if ($cert->status !== GiftCertificate::STATUS_ACTIVE) {
            return false;
        }
        if ($cert->expires_at && $cert->expires_at->isPast()) {
            return false;
        }

        return true;
    }

    public function availableAmount(GiftCertificate $cert): float
    {
        return max(0, round((float) $cert->balance_amount - (float) $cert->reserved_amount, 2));
    }

    public function activeReservedAmountForCart(GiftCertificate $cert, string $cartToken): float
    {
        $last = GiftCertificateTransaction::query()
            ->where('gift_certificate_id', $cert->id)
            ->where('cart_token', $cartToken)
            ->whereIn('type', [
                GiftCertificateTransaction::TYPE_RESERVE,
                GiftCertificateTransaction::TYPE_RELEASE,
                GiftCertificateTransaction::TYPE_DEBIT,
            ])
            ->orderByDesc('id')
            ->first();

        if (!$last || $last->type !== GiftCertificateTransaction::TYPE_RESERVE) {
            return 0.0;
        }

        return max(0, round((float) $last->amount, 2));
    }

    /**
     * Снимает все резервы по cart_token (смена сертификата, очистка корзины, пустой код).
     */
    public function releaseAllReservesForCartToken(string $cartToken): void
    {
        $certIds = GiftCertificateTransaction::query()
            ->where('cart_token', $cartToken)
            ->distinct()
            ->pluck('gift_certificate_id');

        foreach ($certIds as $certIdRaw) {
            $certId = (int) $certIdRaw;
            DB::transaction(function () use ($certId, $cartToken): void {
                $locked = GiftCertificate::query()->whereKey($certId)->lockForUpdate()->first();
                if (!$locked) {
                    return;
                }
                $active = $this->activeReservedAmountForCart($locked, $cartToken);
                if ($active <= 0) {
                    return;
                }
                $bal = (float) $locked->balance_amount;
                $this->writeTx($locked, GiftCertificateTransaction::TYPE_RELEASE, $active, $bal, $bal, null, $cartToken, null);
                $locked->reserved_amount = max(0, round((float) $locked->reserved_amount - $active, 2));
                $locked->save();
            });
        }
    }

    /**
     * Пересчитать резерв под текущую сумму к оплате сертификатом (после скидки карты, без учёта сертификата).
     */
    public function syncReserveForCart(Cart $cart, GiftCertificate $cert, float $payableBeforeCertificate): void
    {
        DB::transaction(function () use ($cart, $cert, $payableBeforeCertificate): void {
            /** @var GiftCertificate $locked */
            $locked = GiftCertificate::query()->whereKey($cert->id)->lockForUpdate()->firstOrFail();

            if (!$this->certificateIsUsable($locked)) {
                return;
            }

            $active = $this->activeReservedAmountForCart($locked, $cart->token);
            if ($active > 0) {
                $bal = (float) $locked->balance_amount;
                $this->writeTx($locked, GiftCertificateTransaction::TYPE_RELEASE, $active, $bal, $bal, null, $cart->token, null);
                $locked->reserved_amount = max(0, round((float) $locked->reserved_amount - $active, 2));
                $locked->save();
                $locked->refresh();
            }

            $avail = $this->availableAmount($locked);
            $reserve = round(min($avail, max(0, $payableBeforeCertificate)), 2);
            if ($reserve <= 0) {
                return;
            }

            $balBefore = (float) $locked->balance_amount;
            $this->writeTx($locked, GiftCertificateTransaction::TYPE_RESERVE, $reserve, $balBefore, $balBefore, null, $cart->token, null);
            $locked->reserved_amount = round((float) $locked->reserved_amount + $reserve, 2);
            $locked->save();
        });
    }

    /**
     * Списание при оформлении заказа: снимаем резерв корзины и уменьшаем баланс.
     */
    public function confirmCheckoutDebit(Order $order, Cart $cart, GiftCertificate $cert, float $amount): void
    {
        $amount = round(max(0, $amount), 2);
        if ($amount <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $cart, $cert, $amount): void {
            /** @var GiftCertificate $locked */
            $locked = GiftCertificate::query()->whereKey($cert->id)->lockForUpdate()->firstOrFail();
            $active = $this->activeReservedAmountForCart($locked, $cart->token);
            $apply = round(min($amount, $active, (float) $locked->balance_amount), 2);
            if ($apply <= 0) {
                return;
            }

            $balBefore = (float) $locked->balance_amount;
            $locked->reserved_amount = max(0, round((float) $locked->reserved_amount - $apply, 2));
            $locked->balance_amount = max(0, round($balBefore - $apply, 2));
            $balAfter = (float) $locked->balance_amount;

            $this->writeTx($locked, GiftCertificateTransaction::TYPE_DEBIT, $apply, $balBefore, $balAfter, $order->id, $cart->token, null);

            if ($locked->balance_amount <= 0) {
                $locked->status = GiftCertificate::STATUS_USED;
            }

            $locked->save();

            OrderGiftCertificate::query()->create([
                'order_id' => $order->id,
                'gift_certificate_id' => $locked->id,
                'code_snapshot' => (string) $locked->code,
                'amount_applied' => $apply,
                'created_at' => now(),
            ]);
        });
    }

    /**
     * Возврат на баланс при отмене заказа после списания.
     */
    public function refundOrderCertificates(Order $order): void
    {
        $rows = OrderGiftCertificate::query()->where('order_id', $order->id)->get();
        foreach ($rows as $row) {
            DB::transaction(function () use ($row, $order): void {
                $exists = GiftCertificateTransaction::query()
                    ->where('gift_certificate_id', $row->gift_certificate_id)
                    ->where('order_id', $order->id)
                    ->where('type', GiftCertificateTransaction::TYPE_REFUND)
                    ->exists();
                if ($exists) {
                    return;
                }

                $locked = GiftCertificate::query()->whereKey($row->gift_certificate_id)->lockForUpdate()->firstOrFail();
                $amt = round((float) $row->amount_applied, 2);
                if ($amt <= 0) {
                    return;
                }

                $balBefore = (float) $locked->balance_amount;
                $locked->balance_amount = round($balBefore + $amt, 2);
                $balAfter = (float) $locked->balance_amount;

                if (in_array($locked->status, [GiftCertificate::STATUS_REDEEMED, GiftCertificate::STATUS_USED], true) && $balAfter > 0) {
                    $locked->status = GiftCertificate::STATUS_ACTIVE;
                }

                $this->writeTx($locked, GiftCertificateTransaction::TYPE_REFUND, $amt, $balBefore, $balAfter, $order->id, null, null);
                $locked->save();
            });
        }
    }

    private function writeTx(
        GiftCertificate $cert,
        string $type,
        float $amount,
        float $balBefore,
        float $balAfter,
        ?int $orderId,
        ?string $cartToken,
        ?array $meta
    ): void {
        GiftCertificateTransaction::query()->create([
            'gift_certificate_id' => $cert->id,
            'type' => $type,
            'amount' => round($amount, 2),
            'balance_before' => round($balBefore, 2),
            'balance_after' => round($balAfter, 2),
            'order_id' => $orderId,
            'cart_token' => $cartToken,
            'meta' => $meta,
            'created_at' => now(),
        ]);
    }
}
