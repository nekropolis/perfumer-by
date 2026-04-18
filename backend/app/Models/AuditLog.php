<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'entity_type',
        'entity_id',
        'warehouse_id',
        'action',
        'summary',
        'context',
        'actor_id',
        'ip_address',
        'created_at',
    ];

    protected $casts = [
        'context' => 'array',
        'entity_id' => 'integer',
        'warehouse_id' => 'integer',
        'created_at' => 'datetime',
    ];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
