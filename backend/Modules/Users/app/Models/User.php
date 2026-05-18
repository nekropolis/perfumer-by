<?php

namespace Modules\Users\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\UserDiscountCard;
use Modules\Users\Enums\Role;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    protected $table = 'users';

    protected $fillable = [
        'name',
        'first_name',
        'last_name',
        'patronymic',
        'birth_date',
        'email',
        'password',
        'phone',
        'phone_verified_at',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'birth_date' => 'date',
        'password' => 'hashed',
    ];

    public function displayName(): string
    {
        $fromParts = trim(implode(' ', array_filter([
            trim((string) ($this->first_name ?? '')),
            trim((string) ($this->patronymic ?? '')),
            trim((string) ($this->last_name ?? '')),
        ])));

        if ($fromParts !== '') {
            return $fromParts;
        }

        $name = trim((string) ($this->name ?? ''));

        return $name !== '' ? $name : 'Пользователь';
    }

    public function isPlaceholderEmail(): bool
    {
        $email = mb_strtolower(trim((string) ($this->email ?? '')), 'UTF-8');

        return $email !== '' && str_ends_with($email, '@phone.local');
    }

    public function profileEmail(): ?string
    {
        return $this->isPlaceholderEmail() ? null : ($this->email ?: null);
    }

    public function hasRole(Role|string $role): bool
    {
        return $this->role === ($role instanceof Role ? $role->value : $role);
    }

    public function hasAnyRole(array $roles): bool
    {
        $roleValues = array_map(function ($role) {
            return $role instanceof Role ? $role->value : $role;
        }, $roles);

        return in_array($this->role, $roleValues, true);
    }

    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    public function discountCards(): BelongsToMany
    {
        return $this->belongsToMany(DiscountCard::class, 'user_discount_cards', 'user_id', 'discount_card_id')
            ->using(UserDiscountCard::class)
            ->withPivot(['linked_at', 'verified_at', 'is_primary', 'source', 'link_status'])
            ->withTimestamps();
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'user_id');
    }

}
