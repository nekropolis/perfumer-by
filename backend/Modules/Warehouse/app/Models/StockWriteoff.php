<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockWriteoff extends Model
{
    public const STATUS_POSTED = 'posted';

    public const STATUS_REVERSED = 'reversed';

    /** @var list<string> */
    public const STATUSES = [
        self::STATUS_POSTED,
        self::STATUS_REVERSED,
    ];

    /**
     * Подписи статусов для UI / API (ключ — значение поля {@see $status}).
     *
     * @var array<string, string>
     */
    public const STATUS_LABELS = [
        self::STATUS_POSTED => 'Проведено',
        self::STATUS_REVERSED => 'Отменена',
    ];

    protected $fillable = [
        'document_no',
        'warehouse_id',
        'type',
        'order_id',
        'status',
        'written_off_at',
        'comment',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'written_off_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(StockWriteoffItem::class)->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
