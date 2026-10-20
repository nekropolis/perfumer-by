<?php

namespace Modules\Catalog\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * JSON-объект attr_id → option_ids (строковые ключи в JSON).
 *
 * @implements CastsAttributes<array<string, list<int>>|null, array<string, list<int>>|null>
 */
class CatalogLandingFiltersCast implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        if (! is_array($value) || $value === []) {
            return null;
        }

        $normalized = [];
        foreach ($value as $attributeId => $optionIds) {
            if (! is_array($optionIds) || $optionIds === []) {
                continue;
            }
            $ids = array_values(array_unique(array_map('intval', $optionIds)));
            $ids = array_values(array_filter($ids, static fn (int $id): bool => $id > 0));
            if ($ids !== []) {
                $normalized[(string) $attributeId] = $ids;
            }
        }

        return $normalized === [] ? null : $normalized;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || $value === []) {
            return null;
        }

        if (is_string($value)) {
            return $value === '' ? null : $value;
        }

        if (! is_array($value)) {
            return null;
        }

        $payload = new \stdClass;
        foreach ($value as $attributeId => $optionIds) {
            if (! is_array($optionIds) || $optionIds === []) {
                continue;
            }
            $ids = array_values(array_unique(array_map('intval', $optionIds)));
            $ids = array_values(array_filter($ids, static fn (int $id): bool => $id > 0));
            if ($ids !== []) {
                $prop = (string) $attributeId;
                $payload->{$prop} = $ids;
            }
        }

        if ($payload == new \stdClass) {
            return null;
        }

        return json_encode($payload, JSON_FORCE_OBJECT);
    }
}
