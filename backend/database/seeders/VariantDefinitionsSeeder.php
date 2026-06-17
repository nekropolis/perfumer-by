<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\VariantDefinition;

class VariantDefinitionsSeeder extends Seeder
{
    private const VOLUMES = [
        2, 3, 9, 7, 10, 15, 27, 30, 33, 35, 50, 60, 75, 65, 80, 85, 87, 90, 100, 125, 150, 200, 225,
    ];

    private const VIAL_VOLUMES = [2, 3];

    private const CONCENTRATIONS = [
        ['code' => 'edt', 'label' => 'туалетная вода'],
        ['code' => 'edc', 'label' => 'одеколон'],
        ['code' => 'extrait de parfum', 'label' => 'духи'],
        ['code' => 'edp', 'label' => 'парфюмерная вода'],
    ];

    public function run(): void
    {
        foreach (self::VOLUMES as $volume) {
            foreach (self::CONCENTRATIONS as $index => $concentration) {
                foreach ([false, true] as $isTester) {
                    $this->upsertDefinition($volume, $concentration, $isTester, false, $index);
                }

                if (in_array($volume, self::VIAL_VOLUMES, true)) {
                    $this->upsertDefinition($volume, $concentration, false, true, $index);
                }
            }
        }
    }

    /**
     * @param  array{code: string, label: string}  $concentration
     */
    private function upsertDefinition(
        int $volume,
        array $concentration,
        bool $isTester,
        bool $isVial,
        int $index,
    ): void {
        $suffix = '';
        if ($isTester) {
            $suffix .= ' / Тестер';
        }
        if ($isVial) {
            $suffix .= ' / Пробник';
        }

        $title = sprintf(
            '%d мл / %s - %s%s',
            $volume,
            strtoupper($concentration['code']),
            $concentration['label'],
            $suffix,
        );

        VariantDefinition::query()->updateOrCreate(
            [
                'volume_ml' => $volume,
                'concentration_code' => $concentration['code'],
                'is_tester' => $isTester,
                'is_vial' => $isVial,
            ],
            [
                'concentration_label' => $concentration['label'],
                'title' => $title,
                'sort_order' => ($volume * 10) + $index + ($isTester ? 1000 : 0) + ($isVial ? 2000 : 0),
            ],
        );
    }
}
