<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class VanilleImportJob extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_RUNNING = 'running';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_FAILED = 'failed';

    /** @var list<string> */
    public const ACTIVE_STATUSES = [self::STATUS_PENDING, self::STATUS_RUNNING];

    protected $fillable = [
        'type',
        'status',
        'progress',
        'message',
        'result',
        'error',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'progress' => 'integer',
        'result' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function logs(): HasMany
    {
        return $this->hasMany(VanilleImportJobLog::class, 'vanille_import_job_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    /**
     * Последняя активная задача без ORDER BY по всей выборке (два MAX(id) по индексу status).
     */
    public static function findLatestActive(): ?self
    {
        $pendingId = (int) static::query()->where('status', self::STATUS_PENDING)->max('id');
        $runningId = (int) static::query()->where('status', self::STATUS_RUNNING)->max('id');
        $id = max($pendingId, $runningId);

        return $id > 0 ? static::query()->find($id) : null;
    }

    /**
     * Сбрасывает «зомби» pending/running, оставляя только самую новую по id.
     *
     * @return int число обновлённых строк
     */
    public static function failDuplicateActiveJobs(?int $keepJobId = null): int
    {
        $keepId = $keepJobId ?? (static::findLatestActive()?->id);
        if ($keepId === null) {
            return 0;
        }

        return static::query()
            ->active()
            ->where('id', '!=', $keepId)
            ->update([
                'status' => self::STATUS_FAILED,
                'progress' => 100,
                'message' => 'Отменено: дубликат активной задачи Vanille',
                'error' => 'Очистка лишних pending/running записей (оставлена задача #' . $keepId . ').',
                'finished_at' => now(),
            ]);
    }

    /**
     * @return list<int>
     */
    public static function staleActiveJobIds(
        Carbon $pendingStaleBefore,
        Carbon $runningStaleBefore,
        int $limit = 25,
    ): array {
        $pendingIds = static::query()
            ->where('status', self::STATUS_PENDING)
            ->where(function ($query) use ($pendingStaleBefore) {
                $query->where('updated_at', '<=', $pendingStaleBefore)
                    ->orWhere(function ($nested) use ($pendingStaleBefore) {
                        $nested->whereNull('updated_at')
                            ->where('created_at', '<=', $pendingStaleBefore);
                    });
            })
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id')
            ->all();

        $runningIds = static::query()
            ->where('status', self::STATUS_RUNNING)
            ->where('updated_at', '<=', $runningStaleBefore)
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id')
            ->all();

        return array_values(array_unique(array_map('intval', [...$pendingIds, ...$runningIds])));
    }
}
