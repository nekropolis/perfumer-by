<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\VeterCity;
use Modules\Checkout\Services\Veter\VeterCitiesSyncService;
use Throwable;

class AdminDeliveryCitiesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $perPage = min(100, max(10, (int) $request->query('per_page', 50)));

        $paginator = VeterCity::query()
            ->with(['district', 'track'])
            ->when($q !== '', fn ($query) => $query->where('name', 'like', "%{$q}%"))
            ->orderBy('name')
            ->paginate($perPage);

        $data = collect($paginator->items())->map(function (VeterCity $city) {
            $district = $city->district;

            return [
                'id' => (int) $city->id,
                'name' => $city->name,
                'full_name' => $city->full_name,
                'village_council_name' => $city->village_council_name,
                'district_id' => $city->district_id !== null ? (int) $city->district_id : null,
                'district_name' => $district?->name,
                'region_id' => $city->region_id !== null ? (int) $city->region_id : null,
                'region_name' => $city->zone_name,
                'zone_name' => $city->zone_name,
                'is_active' => (bool) $city->is_active,
                'delivery_days' => $district?->deliveryDays() ?? [
                    'monday' => 0,
                    'tuesday' => 0,
                    'wednesday' => 0,
                    'thursday' => 0,
                    'friday' => 0,
                    'saturday' => 0,
                    'sunday' => 0,
                ],
                'updated_at' => $city->updated_at?->toIso8601String(),
            ];
        })->values()->all();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function sync(VeterCitiesSyncService $sync): JsonResponse
    {
        try {
            $result = $sync->sync();
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 502);
        }

        return response()->json([
            'message' => 'Синхронизация завершена',
            'data' => $result,
        ]);
    }
}
