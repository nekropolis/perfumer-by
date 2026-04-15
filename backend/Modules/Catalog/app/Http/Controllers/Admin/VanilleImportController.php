<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Modules\Catalog\Services\Vanille\VanilleImportService;
use Modules\Catalog\Models\SupplierProduct;


class VanilleImportController extends Controller
{
    public function parseBrands(VanilleImportService $service)
    {
        $result = $service->parseBrands();

        return response()->json($result);
    }

    public function collectLinks(Request $request, VanilleImportService $service)
    {
        $offset = (int) $request->input('offset', 0);
        $limit = (int) $request->input('limit', 100);
        $maxLinks = $request->filled('max_links') ? (int) $request->input('max_links') : 100;

        $result = $service->collectProductLinks($offset, $limit, $maxLinks);

        return response()->json($result);
    }

    public function parseProducts(Request $request, VanilleImportService $service)
    {
        $offset = (int) $request->input('offset', 0);
        $limit = (int) $request->input('limit', 20);
        $maxLinks = $request->filled('max_links') ? (int) $request->input('max_links') : 100;

        $result = $service->parseProducts($offset, $limit, $maxLinks);

        return response()->json($result);
    }

    public function supplierProducts(Request $request)
    {
        $query = SupplierProduct::query()
            ->with(['supplier', 'brand', 'product'])
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id');

        if ($request->filled('linked')) {
            $linked = filter_var($request->string('linked')->toString(), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($linked !== null) {
                $query->where('is_linked', $linked);
            }
        }

        if ($request->filled('active')) {
            $active = filter_var($request->string('active')->toString(), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($active !== null) {
                $query->where('is_active', $active);
            }
        }

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('external_name', 'like', "%{$search}%")
                    ->orWhere('external_slug', 'like', "%{$search}%")
                    ->orWhere('external_url', 'like', "%{$search}%");
            });
        }

        $items = $query->paginate(50);

        return response()->json($items);
    }

    public function importParsedProducts(VanilleImportService $service)
    {
        $result = $service->importParsedProducts();

        return response()->json($result);
    }
}
