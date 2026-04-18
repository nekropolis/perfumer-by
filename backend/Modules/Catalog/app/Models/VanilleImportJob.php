<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VanilleImportJob extends Model
{
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
}
