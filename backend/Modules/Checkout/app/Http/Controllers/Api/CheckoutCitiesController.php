<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\VeterCity;

class CheckoutCitiesController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $id = (int) $request->get('id', 0);
        if ($id > 0) {
            $city = VeterCity::query()
                ->active()
                ->with(['district', 'track'])
                ->find($id);

            return response()->json([
                'data' => $city ? [$this->mapCity($city)] : [],
            ]);
        }

        $query = trim((string) $request->get('q'));

        if (mb_strlen($query) < 2) {
            return response()->json(['data' => []]);
        }

        $items = VeterCity::query()
            ->active()
            ->search($query)
            ->with(['district', 'track'])
            ->whereRaw('LOWER(TRIM(COALESCE(name, ""))) NOT IN (?, ?, ?)', [
                'minsk',
                'минск',
                'мінск',
            ])
            ->orderBy('name')
            ->limit(15)
            ->get()
            ->map(fn (VeterCity $city) => $this->mapCity($city));

        return response()->json(['data' => $items]);
    }

    /**
     * @return array{
     *     id: int,
     *     name: string,
     *     full_name: string,
     *     village_council_name: string|null,
     *     zone_name: string|null,
     *     region_name: string|null,
     *     district_name: string|null,
     *     delivery_days: array{monday: int, tuesday: int, wednesday: int, thursday: int, friday: int, saturday: int, sunday: int}
     * }
     */
    private function mapCity(VeterCity $city): array
    {
        $district = $city->district;

        return [
            'id' => (int) $city->id,
            'name' => $city->name,
            'full_name' => $city->full_name,
            'village_council_name' => $city->village_council_name,
            'zone_name' => $city->zone_name,
            'region_name' => $city->zone_name,
            'district_name' => $district?->name,
            'delivery_days' => $district?->deliveryDays() ?? [
                'monday' => 0,
                'tuesday' => 0,
                'wednesday' => 0,
                'thursday' => 0,
                'friday' => 0,
                'saturday' => 0,
                'sunday' => 0,
            ],
        ];
    }
}
