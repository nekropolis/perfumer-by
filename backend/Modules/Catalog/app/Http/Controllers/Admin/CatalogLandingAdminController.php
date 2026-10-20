<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Http\Requests\Admin\StoreCatalogLandingRequest;
use Modules\Catalog\Http\Requests\Admin\UpdateCatalogLandingRequest;
use Modules\Catalog\Http\Resources\CatalogLandingResource;
use Modules\Catalog\Models\CatalogLanding;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Pages\Services\SeoSitemapService;

class CatalogLandingAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = CatalogLanding::query()->orderBy('sort')->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search): void {
                $q->where('slug', 'like', "%{$search}%")
                    ->orWhere('h1', 'like', "%{$search}%")
                    ->orWhere('seo_title', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate(20));
    }

    public function show(int $id): JsonResponse
    {
        $landing = CatalogLanding::query()->findOrFail($id);

        return response()->json([
            'data' => new CatalogLandingResource($landing),
        ]);
    }

    public function store(StoreCatalogLandingRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $slug = VanilleHelper::slugify((string) $validated['slug']);

        if ($slug === '') {
            return response()->json(['message' => 'Slug обязателен'], 422);
        }

        $landing = CatalogLanding::query()->create([
            'slug' => $slug,
            'gender' => VanilleHelper::normalizeNullableString($validated['gender'] ?? null),
            'filters' => $this->normalizeFilters($validated['filters'] ?? null),
            'h1' => trim((string) $validated['h1']),
            'seo_title' => trim((string) $validated['seo_title']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'sort' => (int) ($validated['sort'] ?? 0),
        ]);

        app(SeoSitemapService::class)->forget();

        return response()->json([
            'message' => 'Посадочная создана',
            'data' => new CatalogLandingResource($landing),
        ], 201);
    }

    public function update(UpdateCatalogLandingRequest $request, int $id): JsonResponse
    {
        $landing = CatalogLanding::query()->findOrFail($id);
        $validated = $request->validated();
        $slug = VanilleHelper::slugify((string) $validated['slug']);

        if ($slug === '') {
            return response()->json(['message' => 'Slug обязателен'], 422);
        }

        $landing->update([
            'slug' => $slug,
            'gender' => VanilleHelper::normalizeNullableString($validated['gender'] ?? null),
            'filters' => $this->normalizeFilters($validated['filters'] ?? null),
            'h1' => trim((string) $validated['h1']),
            'seo_title' => trim((string) $validated['seo_title']),
            'seo_description' => VanilleHelper::normalizeNullableString($validated['seo_description'] ?? null),
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? $landing->is_active),
            'sort' => (int) ($validated['sort'] ?? $landing->sort),
        ]);

        app(SeoSitemapService::class)->forget();

        return response()->json([
            'message' => 'Посадочная обновлена',
            'data' => new CatalogLandingResource($landing->fresh()),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        CatalogLanding::query()->findOrFail($id)->delete();
        app(SeoSitemapService::class)->forget();

        return response()->json([
            'message' => 'Посадочная удалена',
        ]);
    }

    /**
     * @param  array<string|int, mixed>|null  $filters
     * @return array<string, list<int>>|null
     */
    private function normalizeFilters(?array $filters): ?array
    {
        if ($filters === null || $filters === []) {
            return null;
        }

        $normalized = [];
        foreach ($filters as $attributeId => $optionIds) {
            if (! is_array($optionIds) || $optionIds === []) {
                continue;
            }
            $ids = array_values(array_unique(array_map('intval', $optionIds)));
            if ($ids !== []) {
                $normalized[(string) (int) $attributeId] = $ids;
            }
        }

        return $normalized === [] ? null : $normalized;
    }
}
