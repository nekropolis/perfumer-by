<?php

namespace Modules\ImportExport\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SeoRedirectController extends Controller
{
    public function resolve(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        $path = trim($validated['path']);
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }

        $redirect = DB::table('seo_redirects')
            ->where('from_path', $path)
            ->where('is_active', true)
            ->first(['to_path', 'http_code']);

        if (! $redirect) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => [
                'to_path' => $redirect->to_path,
                'http_code' => (int) $redirect->http_code,
            ],
        ]);
    }
}
