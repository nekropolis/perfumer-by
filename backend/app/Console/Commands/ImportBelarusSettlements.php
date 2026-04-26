<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ImportBelarusSettlements extends Command
{
    protected $signature = 'settlements:import-belarus';

    protected $description = 'Import Belarus settlements from OSM JSON with deduplication';

    public function handle(): int
    {
        $disk = Storage::disk('public');
        $path = 'imports/belarus-settlements.json';

        if (! $disk->exists($path)) {
            $this->error("File not found: storage/app/public/{$path}");
            return self::FAILURE;
        }

        $json = json_decode($disk->get($path), true);

        if (! is_array($json) || empty($json['elements'])) {
            $this->error('Invalid JSON.');
            return self::FAILURE;
        }

        DB::table('settlements')->truncate();

        $elements = collect($json['elements'])
            ->filter(fn ($item) => !empty($item['tags']))
            ->sortBy(fn ($item) => match ($item['type'] ?? null) {
                'node' => 1,
                'way' => 2,
                'relation' => 3,
                default => 0,
            })
            ->values();

        $prepared = [];
        $now = now();

        foreach ($elements as $element) {
            $tags = $element['tags'] ?? [];

            if (($tags['addr:country'] ?? null) !== 'BY') {
                continue;
            }

            if (empty($tags['place'])) {
                continue;
            }

            $name = $this->pickName($tags);

            if (!$name) {
                continue;
            }

            $dedupeKey = $this->makeDedupeKey($tags);

            if (!$dedupeKey) {
                continue;
            }

            $lat = $element['lat'] ?? ($element['center']['lat'] ?? null);
            $lon = $element['lon'] ?? ($element['center']['lon'] ?? null);

            $prepared[$dedupeKey] = [
                'osm_type' => $element['type'],
                'osm_id' => $element['id'],

                'country_code' => 'BY',

                'name' => $name,
                'name_be' => $tags['name:be'] ?? null,
                'name_ru' => $tags['name:ru'] ?? null,
                'name_en' => $tags['name:en'] ?? null,
                'int_name' => $tags['int_name'] ?? null,

                'name_prefix' => $tags['name:prefix:ru']
                    ?? $tags['name:prefix']
                        ?? null,

                'place' => $tags['place'] ?? null,

                'region_name' => $tags['addr:region'] ?? null,
                'district_name' => $tags['addr:district'] ?? null,
                'subdistrict_name' => $tags['addr:subdistrict'] ?? null,

                'postcode' => $tags['addr:postcode']
                    ?? $tags['postal_code']
                        ?? null,

                'latitude' => $lat,
                'longitude' => $lon,

                'wikidata' => $tags['wikidata'] ?? null,
                'wikipedia' => $tags['wikipedia'] ?? null,

                'osm_tags' => json_encode($tags, JSON_UNESCAPED_UNICODE),

                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        $rows = array_values($prepared);

        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table('settlements')->insert($chunk);
        }

        $this->info('Imported: ' . count($rows) . ' unique settlements.');

        return self::SUCCESS;
    }

    private function pickName(array $tags): ?string
    {
        return $tags['name:ru']
            ?? $tags['name']
            ?? $tags['name:be']
            ?? $tags['int_name']
            ?? $tags['name:en']
            ?? null;
    }

    private function makeDedupeKey(array $tags): ?string
    {
        $name = mb_strtolower($tags['name:ru'] ?? $tags['name'] ?? '');

        if (!$name) {
            return null;
        }

        $place = mb_strtolower($tags['place'] ?? '');
        $region = mb_strtolower($tags['addr:region'] ?? '');
        $district = mb_strtolower($tags['addr:district'] ?? '');
        $subdistrict = mb_strtolower($tags['addr:subdistrict'] ?? '');

        return md5(
            implode('|', [
                $name,
                $place,
                $subdistrict,
                $district,
                $region,
            ])
        );
    }
}
