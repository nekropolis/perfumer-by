<?php

namespace Modules\Pages\Http\Controllers\Api;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Pages\Models\CmsPage;
use Modules\Pages\Models\CmsPost;

/**
 * Агрегированный список публичных path для Next.js sitemap (без пагинации фронта).
 */
class SeoSitemapController extends Controller
{
    public function index(): JsonResponse
    {
        $byPath = [];

        $pages = CmsPage::query()
            ->where('is_active', true)
            ->select(['slug', 'updated_at'])
            ->get();

        foreach ($pages as $page) {
            if ($page->slug === '') {
                continue;
            }
            $path = '/'.ltrim($page->slug, '/');
            $byPath[$path] = $this->row($path, $page->updated_at);
        }

        $posts = CmsPost::query()
            ->where('is_active', true)
            ->whereNotNull('slug')
            ->select(['slug', 'updated_at'])
            ->get();

        foreach ($posts as $post) {
            if ($post->slug === null || $post->slug === '') {
                continue;
            }
            $path = '/'.ltrim($post->slug, '/');
            if (! isset($byPath[$path])) {
                $byPath[$path] = $this->row($path, $post->updated_at);
            }
        }

        $products = Product::query()
            ->where('is_active', true)
            ->select(['slug', 'updated_at'])
            ->get();

        foreach ($products as $product) {
            if ($product->slug === '') {
                continue;
            }
            $path = '/product/'.$product->slug;
            $byPath[$path] = $this->row($path, $product->updated_at);
        }

        $brands = Brand::query()
            ->where('is_active', true)
            ->select(['slug', 'updated_at'])
            ->get();

        foreach ($brands as $brand) {
            if ($brand->slug === '') {
                continue;
            }
            $path = '/brands/'.$brand->slug;
            if (! isset($byPath[$path])) {
                $byPath[$path] = $this->row($path, $brand->updated_at);
            }
        }

        return response()->json([
            'data' => array_values($byPath),
        ]);
    }

    /**
     * @return array{path: string, lastModified: string|null}
     */
    private function row(string $path, mixed $updatedAt): array
    {
        $iso = null;
        if ($updatedAt !== null) {
            $iso = Carbon::parse($updatedAt)->toAtomString();
        }

        return [
            'path' => $path,
            'lastModified' => $iso,
        ];
    }
}
