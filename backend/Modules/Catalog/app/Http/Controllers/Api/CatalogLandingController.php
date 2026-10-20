<?php

namespace Modules\Catalog\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Catalog\Http\Resources\CatalogLandingResource;
use Modules\Catalog\Models\CatalogLanding;

class CatalogLandingController extends Controller
{
    public function showBySlug(string $slug): JsonResponse
    {
        $landing = CatalogLanding::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        return response()->json([
            'data' => new CatalogLandingResource($landing),
        ]);
    }
}
