<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VanilleImportJobLog extends Model
{
    protected $fillable = [
        'vanille_import_job_id',
        'level',
        'message',
        'context',
    ];

    protected $casts = [
        'context' => 'array',
    ];

    public function importJob(): BelongsTo
    {
        return $this->belongsTo(VanilleImportJob::class, 'vanille_import_job_id');
    }
}
