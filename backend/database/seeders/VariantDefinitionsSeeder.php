<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\VariantDefinitionVolume;

class VariantDefinitionsSeeder extends Seeder
{
    private const PARFUM_CODE = 'parfum';

    private const VOLUMES = [
        2, 3, 9, 7, 10, 15, 27, 30, 33, 35, 50, 60, 75, 65, 80, 85, 87, 90, 100, 125, 150, 200, 225,
    ];

    private const CONCENTRATIONS = [
        ['code' => 'edt', 'label' => 'туалетная вода'],
        ['code' => 'edc', 'label' => 'одеколон'],
        ['code' => 'extrait de parfum', 'label' => 'духи'],
        ['code' => 'edp', 'label' => 'парфюмерная вода'],
        ['code' => self::PARFUM_CODE, 'label' => 'духи'],
    ];

    public function run(): void
    {
        foreach (self::VOLUMES as $volume) {
            foreach (self::CONCENTRATIONS as $index => $concentration) {
                foreach ([false, true] as $isTester) {
                    $this->upsertDefinition((float) $volume, $concentration, $isTester, false, $index);
                }
            }
        }

        foreach (self::CONCENTRATIONS as $index => $concentration) {
            foreach ($this->vialVolumes() as $volume) {
                $this->upsertDefinition($volume, $concentration, false, true, $index);
            }
        }
    }

    /**
     * @return list<float>
     */
    private function vialVolumes(): array
    {
        $volumes = [];

        for ($volume = 0.5; $volume <= 3.0 + 0.001; $volume += 0.1) {
            $volumes[] = round($volume, 1);
        }

        return $volumes;
    }

    /**
     * @param  array{code: string, label: string}  $concentration
     */
    private function upsertDefinition(
        float $volume,
        array $concentration,
        bool $isTester,
        bool $isVial,
        int $index,
    ): void {
        $title = VariantDefinitionVolume::buildTitle(
            $volume,
            $concentration['code'],
            $concentration['label'],
            $isTester,
            $isVial,
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
                'excludes_from_free_delivery_threshold' => $isVial,
            ],
        );
    }
}
