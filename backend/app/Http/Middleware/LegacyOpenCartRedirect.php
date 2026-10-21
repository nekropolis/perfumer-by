<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Modules\ImportExport\Support\SeoRedirectCache;
use Symfony\Component\HttpFoundation\Response;

/**
 * OpenCart leftover URLs hit Laravel via nginx `location ~ index.php`, not Next.js.
 * Resolve them from seo_redirects using a normalized /index.php?… from_path.
 */
class LegacyOpenCartRedirect
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->getPathInfo() !== '/index.php') {
            return $next($request);
        }

        $query = $request->query();
        if ($query === []) {
            return $next($request);
        }

        $fromPath = $this->normalizedFromPath($query);
        if ($fromPath === null) {
            return $next($request);
        }

        $redirect = SeoRedirectCache::resolve($fromPath);
        if ($redirect === null) {
            return $next($request);
        }

        $code = (int) $redirect['http_code'];
        if ($code === 410) {
            return response('', 410);
        }

        $to = $redirect['to_path'] ?? null;
        if (! is_string($to) || $to === '' || ($code !== 301 && $code !== 302)) {
            return $next($request);
        }

        return redirect()->to($to, $code);
    }

    /**
     * @param  array<string, mixed>  $query
     */
    private function normalizedFromPath(array $query): ?string
    {
        $route = isset($query['route']) ? trim((string) $query['route']) : '';
        if ($route === '') {
            return null;
        }

        $parts = ['route='.$route];

        if (isset($query['path']) && trim((string) $query['path']) !== '') {
            $parts[] = 'path='.trim((string) $query['path']);
        }

        if (isset($query['product_id']) && trim((string) $query['product_id']) !== '') {
            $parts[] = 'product_id='.trim((string) $query['product_id']);
        }

        return '/index.php?'.implode('&', $parts);
    }
}
