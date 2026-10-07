<?php

namespace Modules\ImportExport\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\ImportExport\Support\SeoRedirectCache;

class SeoRedirectController extends Controller
{
    public function resolve(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        // Clients may send encodeURI paths ("/foo%20"); keep decoded trailing spaces.
        // Do not trim() the whole path — legacy slugs can end with a real space.
        $path = rawurldecode($validated['path']);
        if (trim($path) === '') {
            return response()->json(['data' => null]);
        }
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }

        $redirect = SeoRedirectCache::resolve($path);

        if (! $redirect) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => [
                'to_path' => $redirect['to_path'],
                'http_code' => $redirect['http_code'],
            ],
        ]);
    }
}
