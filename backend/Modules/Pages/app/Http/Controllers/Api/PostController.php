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

    public function show(int $id): JsonResponse
    {
        $post = CmsPost::query()
            ->where('id', $id)
            ->where('is_active', true)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => (int) $post->id,
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
}
