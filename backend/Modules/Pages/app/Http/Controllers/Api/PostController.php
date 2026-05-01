<?php

namespace Modules\Pages\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Pages\Models\CmsPost;

class PostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $limit = min(24, max(1, (int) $request->query('limit', 8)));

        $query = CmsPost::query()
            ->where('is_active', true)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        $type = trim((string) $request->query('type', ''));
        if ($type !== '') {
            $query->where('type', $type);
        }

        $items = $query
            ->limit($limit)
            ->get()
            ->map(function (CmsPost $post): array {
                return [
                    'id' => (int) $post->id,
                    'slug' => (string) $post->slug,
                    'title' => (string) $post->title,
                    'type' => (string) $post->type,
                    'excerpt' => $post->excerpt,
                    'cover_image' => $post->cover_image,
                    'created_at' => $post->created_at,
                ];
            })
            ->values();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $type = trim((string) $request->query('type', ''));

        $post = $this->findActivePostBySlug($slug, $type);

        if (! $post && ctype_digit($slug)) {
            $post = $this->findActivePostByLegacyId((int) $slug, $type);
        }

        abort_unless($post instanceof CmsPost, 404);

        return response()->json([
            'data' => [
                'id' => (int) $post->id,
                'slug' => (string) $post->slug,
                'title' => $post->title,
                'type' => $post->type,
                'excerpt' => $post->excerpt,
                'cover_image' => $post->cover_image,
                'content' => $post->content,
                'seo_title' => $post->seo_title,
                'seo_description' => $post->seo_description,
                'created_at' => $post->created_at,
                'updated_at' => $post->updated_at,
            ],
        ]);
    }

    private function findActivePostBySlug(string $slug, string $typeFilter): ?CmsPost
    {
        $query = CmsPost::query()
            ->where('slug', $slug)
            ->where('is_active', true);

        if ($typeFilter !== '' && in_array($typeFilter, [CmsPost::TYPE_NEWS, CmsPost::TYPE_ARTICLE], true)) {
            $query->where('type', $typeFilter);
        }

        return $query->first();
    }

    private function findActivePostByLegacyId(int $id, string $typeFilter): ?CmsPost
    {
        $query = CmsPost::query()
            ->whereKey($id)
            ->where('is_active', true);

        if ($typeFilter !== '' && in_array($typeFilter, [CmsPost::TYPE_NEWS, CmsPost::TYPE_ARTICLE], true)) {
            $query->where('type', $typeFilter);
        }

        return $query->first();
    }
}
