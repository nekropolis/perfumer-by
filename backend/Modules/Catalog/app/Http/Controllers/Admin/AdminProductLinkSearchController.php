<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Services\CatalogProductLinkSearchService;

/**
 * Поиск товара для связи с прайсом / приходами: токенизация и AND-условия вынесены в
 * {@see CatalogProductLinkSearchService} (та же логика используется в матчинге Seller One).
 */
class AdminProductLinkSearchController extends Controller
{
    private const int DEFAULT_LIMIT = 40;

    private const int MAX_LIMIT = 60;

    public function __construct(
        private readonly CatalogProductLinkSearchService $linkSearchService,
    ) {
    }

    /**
     * Список товаров (как GET /admin/products с search), но с устойчивым отбором по токенам.
     */
    public function index(Request $request): JsonResponse
    {
        $q = trim($request->string('q')->toString());
        $limit = max(1, min((int) $request->input('limit', self::DEFAULT_LIMIT), self::MAX_LIMIT));
        $brandId = $request->filled('brand_id') ? (int) $request->input('brand_id') : null;

        if (mb_strlen($q, 'UTF-8') < 2) {
            return response()->json(['data' => []]);
        }

        $rows = $this->linkSearchService->searchForAdminProductList($q, $brandId, $limit);

        return response()->json(['data' => $rows]);
    }
}
