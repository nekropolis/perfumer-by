<?php

namespace Modules\Pages\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Pages\Services\SeoSitemapService;

/**
 * Агрегированный список публичных path для Next.js sitemap (без пагинации фронта).
 */
class SeoSitemapController extends Controller
{
    public function __construct(
        private readonly SeoSitemapService $sitemap,
    ) {}

    public function index(Request $request): JsonResponse
    {
        if ($request->boolean('meta')) {
            return response()->json([
                'meta' => [
                    'count' => $this->sitemap->count(),
                ],
            ]);
        }

        return response()->json([
            'data' => $this->sitemap->urls(),
        ]);
    }
}
