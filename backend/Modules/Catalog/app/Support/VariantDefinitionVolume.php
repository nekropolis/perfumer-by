<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;

class VariantDefinitionVolume
{
    /**
     * @return array<int, mixed>
     */
    public static function validationRules(): array
    {
        return ['required', 'numeric', 'min:0.1', 'max:99999'];
    }

    /**
     * @return array<string, string>
     */
    public static function validationMessages(): array
    {
        return [
            'volume_ml.required' => 'Укажите объем в миллилитрах',
            'volume_ml.numeric' => 'Объем должен быть числом (можно 1,3 или 1.3)',
            'volume_ml.min' => 'Минимальный объем — 0,1 мл',
            'volume_ml.max' => 'Слишком большой объем',
        ];
    }

    public static function normalize(mixed $value): float
    {
        if (is_string($value)) {
            $value = str_replace(',', '.', trim($value));
        }

        return round((float) $value, 1);
    }

    public static function formatForTitle(float $volumeMl): string
    {
        $normalized = round($volumeMl, 1);

        if (abs($normalized - round($normalized)) < 0.001) {
            return (string) (int) round($normalized);
        }

        $formatted = rtrim(rtrim(number_format($normalized, 1, '.', ''), '0'), '.');

        return str_replace('.', ',', $formatted);
    }

    public static function buildTitle(
        float $volumeMl,
        string $concentrationCode,
        string $concentrationLabel,
        bool $isTester,
        bool $isVial = false,
        bool $isMiniature = false,
    ): string {
        $title = sprintf(
            '%s мл / %s - %s',
            self::formatForTitle($volumeMl),
            mb_strtoupper(trim($concentrationCode)),
            trim($concentrationLabel)
        );

        if ($isTester) {
            $title .= ' / Тестер';
        }

        if ($isVial) {
            $title .= ' / Пробник';
        }

        if ($isMiniature) {
            $title .= ' / Миниатюра';
        }

        return $title;
    }

    /**
     * @param  Collection<int, ProductVariantLink>|iterable<int, ProductVariantLink>  $variants
     * @return Collection<int, ProductVariantLink>
     */
    public static function sortVariantLinks(Collection|iterable $variants): Collection
    {
        $collection = $variants instanceof Collection ? $variants : collect($variants);

        return $collection
            ->sortBy(static function ($variant): array {
                $volume = $variant->definition?->volume_ml ?? $variant->volume;

                return [(float) ($volume ?? PHP_FLOAT_MAX), (int) $variant->id];
            })
            ->values();
    }

    /**
     * Уникальность: volume_ml + concentration_code + is_tester + is_vial + is_miniature (см. variant_definition_unique).
     * concentration_label в ключ не входит.
     */
    public static function assertUnique(
        float $volumeMl,
        string $concentrationCode,
        bool $isTester,
        bool $isVial,
        bool $isMiniature = false,
        ?int $ignoreId = null,
        bool $isSet = false,
    ): void {
        $exists = VariantDefinition::query()
            ->where('volume_ml', $volumeMl)
            ->where('concentration_code', mb_strtolower(trim($concentrationCode)))
            ->where('is_tester', $isTester)
            ->where('is_vial', $isVial)
            ->where('is_miniature', $isMiniature)
            ->where('is_set', $isSet)
            ->when($ignoreId !== null, static fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'volume_ml' => ['Такой вариант уже есть в справочнике (объем, код концентрации, тестер, пробник, миниатюра).'],
            ]);
        }
    }
}
