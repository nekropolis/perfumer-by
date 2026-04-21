<?php

namespace Modules\Pages\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Pages\Models\CmsPage;

class PageController extends Controller
{
    public function showBySlug(string $slug): JsonResponse
    {
        $page = CmsPage::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => (int) $page->id,
                'name' => $page->name,
                'slug' => $page->slug,
                'h1' => $page->h1,
                'content' => $page->content,
                'seo_title' => $page->seo_title,
                'seo_description' => $page->seo_description,
                'updated_at' => $page->updated_at,
            ],
        ]);
    }
}
