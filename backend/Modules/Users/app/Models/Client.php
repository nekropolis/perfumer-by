<?php

namespace Modules\Users\Models;

use Database\Factories\ClientFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Modules\Cart\Models\Cart;
use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\ClientDiscountCard;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Wishlist\Models\WishlistItem;

class Client extends Authenticatable
{
    /** @use HasFactory<ClientFactory> */
    use HasApiTokens, HasFactory;

    protected $table = 'clients';

    protected $fillable = [
        'name',
        'first_name',
        'last_name',
        'patronymic',
        'birth_date',
        'email',
        'password',
        'phone',
        'additional_phone',
        'phone_verified_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
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

        return $name !== '' ? $name : 'Клиент';
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

    protected static function newFactory(): ClientFactory
    {
        return ClientFactory::new();
    }

    public function discountCards(): BelongsToMany
    {
        return $this->belongsToMany(DiscountCard::class, 'client_discount_cards', 'client_id', 'discount_card_id')
            ->using(ClientDiscountCard::class)
            ->withPivot(['linked_at', 'verified_at', 'is_primary', 'source', 'link_status'])
            ->withTimestamps();
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'client_id');
    }

    public function carts(): HasMany
    {
        return $this->hasMany(Cart::class, 'client_id');
    }

    public function wishlistItems(): HasMany
    {
        return $this->hasMany(WishlistItem::class, 'client_id');
    }
}
