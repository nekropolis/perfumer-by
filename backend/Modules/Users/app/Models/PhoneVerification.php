<?php

namespace Modules\Users\Models;

use Illuminate\Database\Eloquent\Model;

class PhoneVerification extends Model
{
    protected $table = 'phone_verifications';

    public const PURPOSE_LEGACY = 'legacy';

    public const PURPOSE_REGISTER = 'register';

    public const PURPOSE_PASSWORD_RESET = 'password_reset';

    protected $fillable = [
        'phone',
        'purpose',
        'meta',
        'code',
        'delivery_channel',
        'delivery_status',
        'delivery_provider_message_id',
        'delivery_error',
        'delivered_at',
        'expires_at',
        'verified_at',
    ];

    protected $casts = [
        'delivered_at' => 'datetime',
        'expires_at' => 'datetime',
        'verified_at' => 'datetime',
    ];
}
