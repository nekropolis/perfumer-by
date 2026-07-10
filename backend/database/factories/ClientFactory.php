<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Modules\Users\Models\Client;

/**
 * @extends Factory<Client>
 */
class ClientFactory extends Factory
{
    protected $model = Client::class;

    protected static ?string $password;

    public function definition(): array
    {
        $phone = '375'.fake()->numerify('#########');

        return [
            'name' => fake()->name(),
            'email' => $phone.'@phone.local',
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'phone' => $phone,
            'phone_verified_at' => now(),
        ];
    }
}
