<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class OrderStatus extends Model
{
    protected $table = 'order_statuses';

    protected $fillable = [
        'code',
        'name',
        'color',
        'sort_order',
        'is_active',
        'is_system',
        'show_in_order_products',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active' => 'boolean',
        'is_system' => 'boolean',
        'show_in_order_products' => 'boolean',
    ];

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeForOrderProducts(Builder $query): Builder
    {
        return $query->where('show_in_order_products', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('name');
    }

    /**
     * @return list<string>
     */
    public static function codesForOrderProducts(): array
    {
        return static::query()
            ->forOrderProducts()
            ->pluck('code')
            ->map(static fn ($code) => (string) $code)
            ->values()
            ->all();
    }

    public static function makeCodeFromName(string $name): string
    {
        $slug = Str::slug($name, '_');
        if ($slug === '') {
            $slug = 'status';
        }

        return Str::limit($slug, 50, '');
    }

    public static function labelForCode(string $code): string
    {
        $name = static::query()->where('code', $code)->value('name');

        return is_string($name) && $name !== '' ? $name : $code;
    }

    public static function colorForCode(string $code): string
    {
        return static::displayForCode($code)['color'];
    }

    /**
     * @return array{label: string, color: string}
     */
    public static function displayForCode(string $code): array
    {
        /** @var \Illuminate\Support\Collection<string, self> $cache */
        $cache = once(static function () {
            return static::query()
                ->get(['code', 'name', 'color'])
                ->keyBy('code');
        });

        $row = $cache->get($code);
        if (!$row) {
            return [
                'label' => $code,
                'color' => '#64748B',
            ];
        }

        $color = (string) $row->color;
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
            $color = '#64748B';
        }

        return [
            'label' => (string) ($row->name !== '' ? $row->name : $code),
            'color' => strtoupper($color),
        ];
    }

    public static function isAssignableCode(string $code, ?string $allowCurrent = null): bool
    {
        if ($allowCurrent !== null && $allowCurrent === $code) {
            return true;
        }

        return static::query()
            ->where('code', $code)
            ->where('is_active', true)
            ->exists();
    }
}
