<?php

namespace Modules\Checkout\Services\Veter;

use Illuminate\Support\Facades\DB;
use Modules\Checkout\Models\VeterCity;
use Modules\Checkout\Models\VeterDistrict;
use Modules\Checkout\Models\VeterTrack;

class VeterCitiesSyncService
{
    public function __construct(
        private readonly VeterCityApiClient $client,
    ) {}

    /**
     * @return array{tracks: int, districts: int, cities: int}
     */
    public function sync(): array
    {
        $tracks = $this->client->fetchTracks();
        $districts = $this->client->fetchDistricts();
        $cities = $this->client->fetchCities();
        $now = now();

        return DB::transaction(function () use ($tracks, $districts, $cities, $now) {
            VeterTrack::query()->update(['is_active' => false, 'updated_at' => $now]);
            VeterDistrict::query()->update(['is_active' => false, 'updated_at' => $now]);
            VeterCity::query()->update(['is_active' => false, 'updated_at' => $now]);

            foreach (array_chunk($tracks, 200) as $chunk) {
                $rows = [];
                foreach ($chunk as $item) {
                    $rows[] = [
                        'id' => $item['id'],
                        'name' => $item['name'],
                        'is_active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                VeterTrack::query()->upsert($rows, ['id'], ['name', 'is_active', 'updated_at']);
            }

            foreach (array_chunk($districts, 200) as $chunk) {
                $rows = [];
                foreach ($chunk as $item) {
                    $rows[] = [
                        'id' => $item['id'],
                        'name' => $item['name'],
                        'monday' => $item['monday'],
                        'tuesday' => $item['tuesday'],
                        'wednesday' => $item['wednesday'],
                        'thursday' => $item['thursday'],
                        'friday' => $item['friday'],
                        'saturday' => $item['saturday'],
                        'sunday' => $item['sunday'],
                        'is_active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                VeterDistrict::query()->upsert(
                    $rows,
                    ['id'],
                    ['name', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'is_active', 'updated_at'],
                );
            }

            foreach (array_chunk($cities, 500) as $chunk) {
                $rows = [];
                foreach ($chunk as $item) {
                    $rows[] = [
                        'id' => $item['id'],
                        'name' => $item['name'],
                        'region_id' => $item['region_id'],
                        'district_id' => $item['district_id'],
                        'village_council_name' => $item['village_council_name'],
                        'is_active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                VeterCity::query()->upsert(
                    $rows,
                    ['id'],
                    ['name', 'region_id', 'district_id', 'village_council_name', 'is_active', 'updated_at'],
                );
            }

            return [
                'tracks' => count($tracks),
                'districts' => count($districts),
                'cities' => count($cities),
            ];
        });
    }
}
