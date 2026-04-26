<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Models\Settlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CheckoutCitiesController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->get('q'));

        if (mb_strlen($query) < 2) {
            return response()->json(['data' => []]);
        }

        $items = Settlement::query()
            ->active()
            ->belarus()
            ->search($query)
            ->whereRaw('LOWER(TRIM(COALESCE(name, ""))) NOT IN (?, ?, ?)', [
                'minsk',
                'минск',
                'мінск',
            ])
            ->orderByRaw("
            CASE place
                WHEN 'city' THEN 1
                WHEN 'town' THEN 2
                WHEN 'village' THEN 3
                WHEN 'hamlet' THEN 4
                WHEN 'isolated_dwelling' THEN 5
                WHEN 'suburb' THEN 6
                ELSE 99
            END
        ")
            ->orderBy('name')
            ->limit(15)
            ->get()
            ->map(fn (Settlement $settlement) => [
                'id' => $settlement->id,

                'name' => $settlement->name,
                'name_ru' => $settlement->name_ru,
                'name_be' => $settlement->name_be,
                'name_en' => $settlement->name_en,

                'full_name' => $settlement->full_name,

                'type' => $settlement->type_label,
                'place' => $settlement->place,
                'name_prefix' => $settlement->name_prefix,

                'region_name' => $settlement->region_name,
                'district_name' => $settlement->district_name,
                'subdistrict_name' => $settlement->subdistrict_name,

                'postcode' => $settlement->postcode,

                'latitude' => $settlement->latitude,
                'longitude' => $settlement->longitude,
            ]);

        return response()->json(['data' => $items]);
    }
}
