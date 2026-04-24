<?php

namespace Modules\Users\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
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
        'password' => 'hashed',
    ];

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

}
