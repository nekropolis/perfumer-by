<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @method static Builder|VeterCity active()
 * @method static Builder|VeterCity search(string $term)
 */
class VeterCity extends Model
{
    protected $table = 'veter_cities';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'region_id',
        'district_id',
        'village_council_name',
        'is_active',
    ];

    protected $casts = [
        'id' => 'integer',
        'region_id' => 'integer',
        'district_id' => 'integer',
        'is_active' => 'boolean',
    ];

    public function track(): BelongsTo
    {
        return $this->belongsTo(VeterTrack::class, 'region_id');
    }

    public function district(): BelongsTo
    {
        return $this->belongsTo(VeterDistrict::class, 'district_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        $term = trim($term);

        return $query->where('name', 'like', "%{$term}%");
    }

    public function getFullNameAttribute(): string
    {
        $parts = [];

        $district = trim((string) ($this->district?->name ?? ''));
        if ($district !== '') {
            $districtLower = mb_strtolower($district);
            $parts[] = str_starts_with($districtLower, 'г.') || str_contains($districtLower, 'р/н')
                ? $district
                : $district.' р/н';
        }

        $council = trim((string) ($this->village_council_name ?? ''));
        if ($council !== '') {
            $councilLower = mb_strtolower($council);
            $parts[] = str_contains($councilLower, 'совет')
                ? $council
                : $council.' Совет';
        }

        $geo = $parts !== [] ? ' ('.implode(', ', $parts).')' : '';

        return trim((string) $this->name).$geo;
    }

    public function getZoneNameAttribute(): ?string
    {
        $name = trim((string) ($this->track?->name ?? ''));

        return $name !== '' ? $name : null;
    }
}
