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
    /**
     * @return array{message: string, code: string}|null null если сертификат можно применить к корзине
     */
    public function giftCertificateApplyBlock(?GiftCertificate $cert): ?array
    {
        if (!$cert) {
            return [
                'message' => 'Такого подарочного сертификата нет, проверьте код.',
                'code' => 'GIFT_CERTIFICATE_NOT_FOUND',
            ];
        }
        if ($cert->status === GiftCertificate::STATUS_NEW) {
            return [
                'message' => 'Сертификат ещё не активирован. Активация выполняется в магазине.',
                'code' => 'GIFT_CERTIFICATE_NOT_ACTIVATED',
            ];
        }
        if ($cert->status !== GiftCertificate::STATUS_ACTIVE) {
            return [
                'message' => 'Сертификат недействителен, свяжитесь с менеджером магазина.',
                'code' => 'GIFT_CERTIFICATE_INACTIVE',
            ];
        }
        if ($cert->expires_at && $cert->expires_at->isPast()) {
            return [
                'message' => 'Срок действия сертификата истёк.',
                'code' => 'GIFT_CERTIFICATE_EXPIRED',
            ];
        }

        $rawCode = $cert->getAttributes()['code'] ?? null;
        if ($rawCode === null || trim((string) $rawCode) === '') {
            return [
                'message' => 'Сертификат недействителен, свяжитесь с менеджером магазина.',
                'code' => 'GIFT_CERTIFICATE_INVALID',
            ];
        }

        return null;
    }

    public function certificateIsUsable(?GiftCertificate $cert): bool
    {
        return $this->giftCertificateApplyBlock($cert) === null;
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
     * Учитывает уже сделанные возвраты по заказу (идемпотентно при повторных sync в админке).
     */
    public function refundOrderCertificates(Order $order): void
    {
        $rows = OrderGiftCertificate::query()->where('order_id', $order->id)->get();
        foreach ($rows as $row) {
            DB::transaction(function () use ($row, $order): void {
                $locked = GiftCertificate::query()->whereKey($row->gift_certificate_id)->lockForUpdate()->firstOrFail();
                $rowAmt = round((float) $row->amount_applied, 2);
                if ($rowAmt <= 0) {
                    return;
                }

                $debited = (float) GiftCertificateTransaction::query()
                    ->where('gift_certificate_id', $row->gift_certificate_id)
                    ->where('order_id', $order->id)
                    ->where('type', GiftCertificateTransaction::TYPE_DEBIT)
                    ->sum('amount');
                $refunded = (float) GiftCertificateTransaction::query()
                    ->where('gift_certificate_id', $row->gift_certificate_id)
                    ->where('order_id', $order->id)
                    ->where('type', GiftCertificateTransaction::TYPE_REFUND)
                    ->sum('amount');
                $outstanding = round(max(0, $debited - $refunded), 2);
                $amt = round(min($rowAmt, $outstanding), 2);
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

    /**
     * Сколько можно списать с сертификата в админ-заказе (с учётом уже списанного по этому заказу).
     */
    public function availableAmountForAdminOrder(GiftCertificate $cert, ?Order $order = null): float
    {
        $avail = $this->availableAmount($cert);
        if ($order === null || ! $order->exists) {
            return $avail;
        }

        $alreadyApplied = (float) OrderGiftCertificate::query()
            ->where('order_id', $order->id)
            ->where('gift_certificate_id', $cert->id)
            ->sum('amount_applied');

        return max(0, round($avail + $alreadyApplied, 2));
    }

    /**
     * Можно ли применить сертификат в админке; для уже привязанного к заказу USED — разрешаем.
     *
     * @return array{message: string, code: string}|null
     */
    public function giftCertificateAdminApplyBlock(?GiftCertificate $cert, ?Order $order = null): ?array
    {
        if ($cert && $order && $order->exists && $cert->status === GiftCertificate::STATUS_USED) {
            $onOrder = OrderGiftCertificate::query()
                ->where('order_id', $order->id)
                ->where('gift_certificate_id', $cert->id)
                ->exists();
            if ($onOrder) {
                $rawCode = $cert->getAttributes()['code'] ?? null;
                if ($rawCode === null || trim((string) $rawCode) === '') {
                    return [
                        'message' => 'Сертификат недействителен, свяжитесь с менеджером магазина.',
                        'code' => 'GIFT_CERTIFICATE_INVALID',
                    ];
                }

                return null;
            }
        }

        return $this->giftCertificateApplyBlock($cert);
    }

    /**
     * Прямое списание сертификата на заказ без корзины (создание/правка в админке).
     */
    public function debitForAdminOrder(Order $order, GiftCertificate $cert, float $amount): void
    {
        $amount = round(max(0, $amount), 2);
        if ($amount <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $cert, $amount): void {
            /** @var GiftCertificate $locked */
            $locked = GiftCertificate::query()->whereKey($cert->id)->lockForUpdate()->firstOrFail();
            $apply = round(min($amount, $this->availableAmount($locked)), 2);
            if ($apply <= 0) {
                return;
            }

            $balBefore = (float) $locked->balance_amount;
            $locked->balance_amount = max(0, round($balBefore - $apply, 2));
            $balAfter = (float) $locked->balance_amount;

            $this->writeTx($locked, GiftCertificateTransaction::TYPE_DEBIT, $apply, $balBefore, $balAfter, $order->id, null, null);

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
     * Заменить списание сертификата по админ-заказу: возврат старых + новое списание (или очистка).
     */
    public function syncAdminOrderGiftCertificate(Order $order, ?GiftCertificate $cert, float $amount): void
    {
        DB::transaction(function () use ($order, $cert, $amount): void {
            $this->refundOrderCertificates($order);
            OrderGiftCertificate::query()->where('order_id', $order->id)->delete();

            if ($cert === null || $amount <= 0) {
                return;
            }

            $this->debitForAdminOrder($order, $cert, $amount);
        });
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
