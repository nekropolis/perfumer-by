<?php

namespace Modules\Pages\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Pages\Models\CmsPost;

class PostAdminController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = CmsPost::query()->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhere('excerpt', 'like', "%{$search}%");
            });
        }

        if ($request->filled('type')) {
            $query->where('type', (string) $request->string('type'));
        }

        return response()->json($query->paginate(20));
    }

    public function show(int $id): JsonResponse
    {
        $post = CmsPost::query()->findOrFail($id);

        return response()->json([
            'data' => $post,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $slug = $this->resolvePersistedSlug($validated, null);

        $post = CmsPost::query()->create([
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'title' => trim((string) $validated['title']),
            'slug' => $slug,
            'type' => (string) $validated['type'],
            'cover_image' => VanilleHelper::normalizeNullableString($validated['cover_image'] ?? null),
            'excerpt' => VanilleHelper::normalizeNullableString($validated['excerpt'] ?? null),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'seo_title' => VanilleHelper::normalizeNullableString($validated['seo_title'] ?? null) ?: trim((string) $validated['title']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $post->id,
            AuditLogService::ACTION_CREATED,
            'CMS-публикация создана',
            [
                'title' => $post->title,
                'type' => $post->type,
            ],
        );

        return response()->json([
            'message' => 'Публикация создана',
            'data' => $post,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $post = CmsPost::query()->findOrFail($id);
        $validated = $this->validatePayload($request);
        $slug = $this->resolvePersistedSlug($validated, $id);

        $post->update([
            'is_active' => (bool) ($validated['is_active'] ?? $post->is_active),
            'title' => trim((string) $validated['title']),
            'slug' => $slug,
            'type' => (string) $validated['type'],
            'cover_image' => VanilleHelper::normalizeNullableString($validated['cover_image'] ?? null),
            'excerpt' => VanilleHelper::normalizeNullableString($validated['excerpt'] ?? null),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'seo_title' => VanilleHelper::normalizeNullableString($validated['seo_title'] ?? null) ?: trim((string) $validated['title']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $post->id,
            AuditLogService::ACTION_UPDATED,
            'CMS-публикация обновлена',
            [
                'title' => $post->title,
                'type' => $post->type,
            ],
        );

        return response()->json([
            'message' => 'Публикация обновлена',
            'data' => $post->fresh(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $post = CmsPost::query()->findOrFail($id);
        $title = $post->title;
        $type = $post->type;
        $entityId = (int) $post->id;
        $post->delete();

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            $entityId,
            AuditLogService::ACTION_DELETED,
            'CMS-публикация удалена',
            [
                'title' => $title,
                'type' => $type,
            ],
        );

        return response()->json([
            'message' => 'Публикация удалена',
        ]);
    }

    public function uploadContentImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $path = $validated['image']->store('cms/posts', 'public');
        $url = Storage::url($path);
        $absolute = preg_match('#^https?://#i', $url) ? $url : rtrim((string) config('app.url'), '/') . $url;

        $pictureHtml = sprintf(
            '<picture><img src="%s" alt="" loading="lazy" decoding="async" /></picture>',
            e($absolute)
        );

        return response()->json([
            'message' => 'Изображение загружено',
            'data' => [
                'url' => $absolute,
                'path' => $path,
                'picture_html' => $pictureHtml,
            ],
        ], 201);
    }

    public function uploadCoverImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $path = $validated['image']->store('cms/posts/covers', 'public');
        $url = Storage::url($path);
        $absolute = preg_match('#^https?://#i', $url) ? $url : rtrim((string) config('app.url'), '/') . $url;

        return response()->json([
            'message' => 'Обложка загружена',
            'data' => [
                'url' => $absolute,
                'path' => $path,
            ],
        ], 201);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'is_active' => ['nullable', 'boolean'],
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:191'],
            'type' => ['required', Rule::in([CmsPost::TYPE_NEWS, CmsPost::TYPE_ARTICLE])],
            'cover_image' => ['nullable', 'string', 'max:2048'],
            'excerpt' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function resolvePersistedSlug(array $validated, ?int $ignoreId): string
    {
        $type = (string) $validated['type'];
        $raw = trim((string) ($validated['slug'] ?? ''));
        $base = $raw !== '' ? Str::slug($raw) : Str::slug((string) $validated['title']);
        if ($base === '') {
            $base = 'post';
        }

        return $this->ensureUniquePostSlug($type, $base, $ignoreId);
    }

    private function ensureUniquePostSlug(string $type, string $base, ?int $ignoreId): string
    {
        $slug = $base;
        $n = 2;
        while (CmsPost::query()
            ->where('type', $type)
            ->where('slug', $slug)
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '<>', $ignoreId))
            ->exists()) {
            $slug = $base.'-'.$n++;
        }

        return $slug;
    }
}
