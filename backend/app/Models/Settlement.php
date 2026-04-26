<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * @method static Builder|Settlement active()
 * @method static Builder|Settlement belarus()
 * @method static Builder|Settlement search(string $term)
 */
class Settlement extends Model
{
    protected $fillable = [
        'osm_type',
        'osm_id',
        'country_code',
        'name',
        'name_be',
        'name_ru',
        'name_en',
        'int_name',
        'name_prefix',
        'place',
        'region_name',
        'district_name',
        'subdistrict_name',
        'postcode',
        'latitude',
        'longitude',
        'wikidata',
        'wikipedia',
        'osm_tags',
        'is_active',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'osm_tags' => 'array',
        'is_active' => 'boolean',
    ];

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeBelarus(Builder $query): Builder
    {
        return $query->where('country_code', 'BY');
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        $term = trim($term);

        return $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "{$term}%")
                ->orWhere('name_ru', 'like', "{$term}%")
                ->orWhere('name_be', 'like', "{$term}%")
                ->orWhere('name_en', 'like', "{$term}%")
                ->orWhere('int_name', 'like', "{$term}%");
        });
    }

    public function getTypeLabelAttribute(): string
    {
        return match ($this->place) {
            'city' => 'Город',
            'town' => 'Город / посёлок',
            'village' => 'Деревня',
            'hamlet' => 'Небольшой населённый пункт',
            'isolated_dwelling' => 'Хутор',
            'suburb' => 'Район / часть населённого пункта',
            default => 'Населённый пункт',
        };
    }

    public function getFullNameAttribute(): string
    {
        return collect([
            $this->name,
            $this->subdistrict_name,
            $this->district_name,
            $this->region_name,
        ])
            ->filter()
            ->unique()
            ->implode(', ');
    }
}
