<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VeterDistrict extends Model
{
    protected $table = 'veter_districts';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
        'is_active',
    ];

    protected $casts = [
        'id' => 'integer',
        'monday' => 'integer',
        'tuesday' => 'integer',
        'wednesday' => 'integer',
        'thursday' => 'integer',
        'friday' => 'integer',
        'saturday' => 'integer',
        'sunday' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * @return array{monday: int, tuesday: int, wednesday: int, thursday: int, friday: int, saturday: int, sunday: int}
     */
    public function deliveryDays(): array
    {
        return [
            'monday' => (int) $this->monday,
            'tuesday' => (int) $this->tuesday,
            'wednesday' => (int) $this->wednesday,
            'thursday' => (int) $this->thursday,
            'friday' => (int) $this->friday,
            'saturday' => (int) $this->saturday,
            'sunday' => (int) $this->sunday,
        ];
    }

    public function cities(): HasMany
    {
        return $this->hasMany(VeterCity::class, 'district_id');
    }
}
