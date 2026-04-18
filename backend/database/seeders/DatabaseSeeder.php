<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            VariantDefinitionsSeeder::class,
            SellerOneMatchRulesSeeder::class,
        ]);

        User::factory()->create([
            'name' => 'Alex_pol',
            'email' => 'test@example.com',
            'phone' => '375259252470',
            'role' => 'admin',
        ]);
    }
}
