<?php

namespace Modules\Loyalty\Services;

use Illuminate\Support\Facades\DB;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\GiftCertificateTemplate;
use Modules\Loyalty\Models\GiftCertificateTransaction;

class GiftCertificateIssueService
{
    public function __construct(
        private readonly GiftCertificateCodeService $codeService,
    ) {}

    /**
     * @param array{
     *   template_id?: int|null,
     *   initial_amount?: float|null,
     *   source?: string|null,
     *   sold_order_id?: int|null,
     *   issued_to_user_id?: int|null,
     *   purchaser_user_id?: int|null,
     *   issued_phone?: string|null,
     *   comment?: string|null,
     *   issued_at?: string|null,
     *   activated_at?: string|null,
     *   expires_at?: string|null,
     *   code?: string|null
     * } $payload
     */
    public function issue(array $payload): GiftCertificate
    {
        $template = null;
        if (!empty($payload['template_id'])) {
            $template = GiftCertificateTemplate::query()->findOrFail((int) $payload['template_id']);
        }

        $initialAmount = (float) ($payload['initial_amount'] ?? 0);
        if ($initialAmount <= 0 && $template) {
            $initialAmount = (float) $template->amount;
        }

        if ($initialAmount <= 0) {
            throw new \InvalidArgumentException('Номинал сертификата должен быть больше 0');
        }

        $code = trim((string) ($payload['code'] ?? ''));
        if ($code === '') {
            $code = $this->codeService->generateCode();
        }

        return DB::transaction(function () use ($payload, $template, $initialAmount, $code): GiftCertificate {
            $certificate = GiftCertificate::query()->create([
                'template_id' => $template?->id,
                'code' => $code,
                'initial_amount' => round($initialAmount, 2),
                'balance_amount' => round($initialAmount, 2),
                'reserved_amount' => 0,
                'status' => GiftCertificate::STATUS_ACTIVE,
                'source' => (string) ($payload['source'] ?: GiftCertificate::SOURCE_MANUAL),
                'sold_order_id' => $payload['sold_order_id'] ?? null,
                'issued_to_user_id' => $payload['issued_to_user_id'] ?? null,
                'purchaser_user_id' => $payload['purchaser_user_id'] ?? null,
                'issued_phone' => $payload['issued_phone'] ?? null,
                'comment' => $payload['comment'] ?? null,
                'issued_at' => $payload['issued_at'] ?? now(),
                'activated_at' => $payload['activated_at'] ?? now(),
                'expires_at' => $payload['expires_at'] ?? null,
                'created_at' => now(),
            ]);

            GiftCertificateTransaction::query()->create([
                'gift_certificate_id' => $certificate->id,
                'type' => 'issue',
                'amount' => round($initialAmount, 2),
                'balance_before' => 0,
                'balance_after' => round($initialAmount, 2),
                'order_id' => $payload['sold_order_id'] ?? null,
                'cart_token' => null,
                'meta' => [
                    'source' => $certificate->source,
                    'template_id' => $template?->id,
                ],
                'created_at' => now(),
            ]);

            return $certificate;
        });
    }
}
