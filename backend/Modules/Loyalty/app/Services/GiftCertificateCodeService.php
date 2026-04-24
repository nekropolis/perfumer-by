<?php

namespace Modules\Loyalty\Services;

use Modules\Loyalty\Models\GiftCertificate;

class GiftCertificateCodeService
{
    public function generateCode(): string
    {
        for ($attempt = 0; $attempt < 100; $attempt++) {
            $code = 'PBY-'.str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $exists = GiftCertificate::query()->where('code', $code)->exists();
            if (!$exists) {
                return $code;
            }
        }

        throw new \RuntimeException('Не удалось сгенерировать уникальный код сертификата');
    }
}
