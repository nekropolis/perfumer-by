<?php

namespace Modules\Pages\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Pages\Models\CmsPage;

class PageAdminController extends Controller
{
    private const RESERVED_SLUGS = [
        'admin',
        'api',
        'catalog',
        'brands',
        'brand',
        'product',
        'products',
        'cart',
        'checkout',
        'login',
        'wishlist',
        'search',
        'account',
        'home',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = CmsPage::query()->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhere('h1', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate(20));
    }

    public function show(int $id): JsonResponse
    {
        $page = CmsPage::query()->findOrFail($id);

        return response()->json([
            'data' => $page,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $slug = VanilleHelper::slugify((string) $validated['slug']);

        if ($slug === '') {
            return response()->json(['message' => 'Slug обязателен'], 422);
        }

        if ($this->isSlugConflicted($slug)) {
            return response()->json(['message' => 'Slug уже занят в каталоге'], 422);
        }
        if ($this->isReservedSlug($slug)) {
            return response()->json(['message' => 'Slug зарезервирован системным роутом'], 422);
        }

        $page = CmsPage::query()->create([
            'name' => trim((string) $validated['name']),
            'slug' => $slug,
            'h1' => VanilleHelper::normalizeNullableString($validated['h1'] ?? null) ?: trim((string) $validated['name']),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'seo_title' => VanilleHelper::normalizeNullableString($validated['seo_title'] ?? null) ?: trim((string) $validated['name']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $page->id,
            AuditLogService::ACTION_CREATED,
            'CMS-страница создана',
            [
                'name' => $page->name,
                'slug' => $page->slug,
            ],
        );

        return response()->json([
            'message' => 'Страница создана',
            'data' => $page,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $page = CmsPage::query()->findOrFail($id);
        $validated = $this->validatePayload($request, $page->id);

        $slug = VanilleHelper::slugify((string) $validated['slug']);

        if ($slug === '') {
            return response()->json(['message' => 'Slug обязателен'], 422);
        }

        if ($this->isSlugConflicted($slug)) {
            return response()->json(['message' => 'Slug уже занят в каталоге'], 422);
        }
        if ($this->isReservedSlug($slug)) {
            return response()->json(['message' => 'Slug зарезервирован системным роутом'], 422);
        }

        $page->update([
            'name' => trim((string) $validated['name']),
            'slug' => $slug,
            'h1' => VanilleHelper::normalizeNullableString($validated['h1'] ?? null) ?: trim((string) $validated['name']),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'seo_title' => VanilleHelper::normalizeNullableString($validated['seo_title'] ?? null) ?: trim((string) $validated['name']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? $page->is_active),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $page->id,
            AuditLogService::ACTION_UPDATED,
            'CMS-страница обновлена',
            [
                'name' => $page->name,
                'slug' => $page->slug,
            ],
        );

        return response()->json([
            'message' => 'Страница обновлена',
            'data' => $page->fresh(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $page = CmsPage::query()->findOrFail($id);
        $name = $page->name;
        $slug = $page->slug;
        $entityId = (int) $page->id;
        $page->delete();

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            $entityId,
            AuditLogService::ACTION_DELETED,
            'CMS-страница удалена',
            [
                'name' => $name,
                'slug' => $slug,
            ],
        );

        return response()->json([
            'message' => 'Страница удалена',
        ]);
    }

    public function uploadContentImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $path = $validated['image']->store('cms/pages', 'public');
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

    private function validatePayload(Request $request, ?int $ignoreId = null): array
    {
        $slugRules = ['required', 'string', 'max:255'];
        $slugRules[] = $ignoreId
            ? Rule::unique('cms_pages', 'slug')->ignore($ignoreId)
            : 'unique:cms_pages,slug';

        return $request->validate([
            'is_active' => ['nullable', 'boolean'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => $slugRules,
            'h1' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
        ]);
    }

    private function isSlugConflicted(string $slug): bool
    {
        return Product::query()->where('slug', $slug)->exists()
            || Brand::query()->where('slug', $slug)->exists();
    }

    private function isReservedSlug(string $slug): bool
    {
        return in_array($slug, self::RESERVED_SLUGS, true);
    }
}
