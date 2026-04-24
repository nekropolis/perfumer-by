<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\UserDiscountCard;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function discountCards(): BelongsToMany
    {
        return $this->belongsToMany(DiscountCard::class, 'user_discount_cards', 'user_id', 'discount_card_id')
            ->using(UserDiscountCard::class)
            ->withPivot(['linked_at', 'verified_at', 'is_primary', 'source', 'link_status'])
            ->withTimestamps();
    }

}
