<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Loyalty\Models\GiftCertificateTemplate;

class GiftCertificateTemplatesSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([25, 50, 70, 100, 150, 200] as $amount) {
            GiftCertificateTemplate::query()->updateOrCreate(
                ['amount' => number_format((float) $amount, 2, '.', '')],
                [
                    'title' => "Сертификат {$amount} руб.",
                    'is_active' => true,
                ]
            );
        }
    }
}
