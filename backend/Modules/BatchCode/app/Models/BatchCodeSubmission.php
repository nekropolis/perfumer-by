<?php

namespace Modules\BatchCode\Models;

use Illuminate\Database\Eloquent\Model;

class BatchCodeSubmission extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'brand_slug',
        'code',
        'code_normalized',
        'printed_date',
        'date_kind',
        'email',
        'ip_hash',
        'user_agent',
        'status',
    ];

    protected $casts = [
        'printed_date' => 'date',
    ];

    public static function hashIp(string $ip): string
    {
        return hash('sha256', $ip.'|'.(string) config('app.key'));
    }
}
