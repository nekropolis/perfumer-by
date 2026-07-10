<?php

namespace Database\Seeders;

use Modules\Users\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call([
            VariantDefinitionsSeeder::class,
            SellerOneMatchRulesSeeder::class,
            GiftCertificateTemplatesSeeder::class,
        ]);

        // Намеренно НЕ используем `User::factory()`: фабрика сначала зовёт свой
        // `definition()`, который требует `fake()` из `fakerphp/faker`. Если
        // проект задеплоен через `composer install --no-dev` — пакета нет, и
        // сид падает ДО того, как наши overrides перекроют default-значения.
        //
        // `firstOrCreate` также делает seeder идемпотентным: повторный прогон
        // не валится на unique-constraint email/phone.
        User::query()->firstOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Alex_pol',
                'phone' => '375259252470',
                'role' => 'admin',
                'password' => 'password',
                'email_verified_at' => now(),
            ]
        );
    }
}
